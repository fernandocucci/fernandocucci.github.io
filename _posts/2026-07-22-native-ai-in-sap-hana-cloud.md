---
layout: post
title: "The database did the work: native AI methods in SAP HANA Cloud"
date: 2026-07-22
image: /assets/og/native-ai-in-sap-hana-cloud.png
---

I went to the HANA CodeJam 2026 expecting a database with AI bolted on the side: embeddings computed somewhere else, vectors pushed into a separate store, a reranker running as its own service, a graph in its own engine. That's the stack I've built before. Instead, the whole day was SQL functions inside SAP HANA Cloud, over tables that never moved. I went back through the labs to understand that properly, not just to have run it.

The clearest way to show what I mean is to walk a RAG pipeline end to end, because that's most of what the labs built.

## A RAG pipeline, step by step, inside the database

A retrieval-augmented pipeline is a chain: parse the documents, chunk them, embed the chunks, store the vectors, search, rerank, then hand the best results to a language model. Normally each step is a separate tool. In the CodeJam, nearly all of them were HANA functions.

**1. Parse.** Turning source files into text is the one step at the front you do yourself, outside the database. In the labs the data arrived already prepared.

**2. Chunk.** Splitting text into passages is a built-in HANA function:

```python
from hana_ml.text.text_splitter import TextSplitter
TextSplitter(split_type='document', doc_type='html').split_text(hdf)
```

It runs in the engine, on the rows already there.

**3. Embed.** The embeddings are generated inside the database, by a model running in HANA Cloud's NLP engine. It happens on both sides of the pipeline. At load time the chunks go through a Predictive Analysis Library (PAL) function, called from `hana_ml`:

```python
from hana_ml.text.pal_embeddings import PALEmbeddings
PALEmbeddings(model_version='SAP_GXY.20250407').fit_transform(hdf, key='ID', target=['content'])
```

At search time the query goes through the same model, but inline in SQL:

```sql
VECTOR_EMBEDDING('your text', 'QUERY', 'SAP_GXY.20250407')
```

Same model version either side, so the two vectors are comparable. You switch NLP on for the instance, and the model is there, addressed by a version string.

**4. Store.** The vectors live in a native HANA column type, `REAL_VECTOR`, in the same table as the source rows. It's declared like any other type, alongside the ordinary ones. This snippet is from a different lab, one that loads pre-trained Word2Vec vectors from outside instead of generating them in HANA. That's why the rows are words and the vectors are 300 dimensions wide:

```python
myconn.create_table("SAMPLE_NEWS", schema="VECTORS",
    table_structure={
        "ID":   "INT",
        "WORD": "NVARCHAR(5000)",
        "WV":   "REAL_VECTOR(300)"
    })
```

Loading a vector is an ordinary insert, with the array handed over as a string that `TO_REAL_VECTOR` parses:

```sql
INSERT INTO "VECTORS"."SAMPLE_NEWS" ("ID", "WORD", "WV")
VALUES (?, ?, TO_REAL_VECTOR(?))
```

There's no separate vector database to keep in sync. The vector is a column on the row it describes.

**5. Search.** Similarity is arithmetic the database already knows:

```sql
SELECT COSINE_SIMILARITY(A.WV, B.WV) AS score,
       L2DISTANCE(A.WV, B.WV) AS dist
FROM ...
```

`COSINE_SIMILARITY` and `L2DISTANCE` run over `REAL_VECTOR` columns directly, as plain SQL. In the retrieval labs the same function takes the query embedding as one of its arguments, which puts the whole of steps 3 and 5 on one line:

```sql
COSINE_SIMILARITY(VECTOR_EMBEDDING(:prompt, 'QUERY', 'SAP_GXY.20250407'), "VECTOR_COL_content")
```

**6. Rerank.** A first vector search is fast but blunt, so the shortlist gets rerun through a sharper model, the cross-encoder `SAP_CER.20250701`, in the database:

```python
from hana_ml.text.pal_cross_encoder import PALCrossEncoder
PALCrossEncoder(model_version='SAP_CER.20250701').predict(data=hdf, key='ID', content=['QUERY', 'content'])
```

This is the step that turns a demo retrieval into a usable one. Embeddings are computed once, and every later search is arithmetic over numbers that already exist. A cross-encoder can't work that way: its score depends on the pair, this query against this document, and at load time you don't have the query yet. So it runs live, per query, over the shortlist the vector search already narrowed. Vector search scans everything and cuts it down. The cross-encoder only sees the survivors.

**7. Generate.** The last step is the language model that writes the answer, and it's also a HANA SQL call:

```sql
AI_TEXT_COMPLETION('... your prompt ...', 'gemini-3.5-flash')
```

`AI_TEXT_COMPLETION` is a HANA function, but this is the one that leaves: it routes out to run the model in SAP AI Core, where GPT, Gemini and Claude are all reachable by name.

So the only step fully on your side is the parsing. Everything after it is a HANA SQL call, and of those, only the model behind the last one runs elsewhere, in SAP AI Core.

## Beyond retrieval: in-database ML and a knowledge graph

Two labs sat outside the RAG pipeline and made the same point from a different direction.

The first was classic machine learning. In the lab it was PCA over a wine dataset, a fit and a transform, nothing else:

```python
from hana_ml.algorithms.pal.decomposition import PCA
pca = PCA(scaling=True, thread_ratio=0.5, scores=True)
pca.fit(data=hdf_wine.add_id().drop('target'), key='ID')
result = pca.transform(data=hdf_wine.add_id().drop('target'), key='ID', n_components=5)
```

I ran a smaller version of that again this week from my own laptop, three synthetic variables down to two components, and none of the arithmetic happened on my machine. HANA computed the components and sent back the scores. The 66.7 / 33.3 split between the two I worked out afterwards, locally, from those scores. `hana_ml` looks like scikit-learn, but it doesn't do the math: it writes SQL, sends it, and the Predictive Analysis Library (PAL) runs the algorithm where the table sits. PAL covers regression, clustering, classification and time series the same way.

The second was a knowledge graph. RDF triples stored in HANA and queried with SPARQL, through a native `SPARQL_EXECUTE` function, wrapped for Python by LangChain's `HanaRdfGraph` and `HanaSparqlQAChain`. The same database holds the relational tables, the vectors and the triples at once, and answers a plain-language question by generating SPARQL against the graph. The SPARQL generation is done by an LLM, so this one crosses the same boundary as the last RAG step.

## Why this matters

Build the comparable stack from parts and you're running an embedding service, a vector database, a reranker, a chunker, a graph database and an ML library: six things to deploy, secure, keep in sync and pay for. In the CodeJam they were functions in one engine, over data that stayed put. On projects I default to asking which library we use for a given job. This flips it to how much of the job can happen where the data already lives, and in a SAP shop, where the data is in HANA anyway, that answer is bigger than I'd assumed.

## The footnote: I tried to run it on my own machine

The part that didn't work. I wanted a copy of this on my own machine to poke at, so I tried the HANA Express Docker image on an Apple Silicon Mac. It doesn't boot. The system database comes up, but the tenant stays stuck in `CREATE` and never gets an index server, because that binary can't run under the x86 emulation the M-chip needs. A forced start just fails: `start databaseServer ... failed (idxFailed=2)`.

It wouldn't have mattered if it had booted. HANA Express doesn't ship the vector engine, the built-in NLP or the knowledge graph. Those are Cloud-only.

What did work: `hana_ml` installs and runs natively on Apple Silicon, because it's a thin client that only generates SQL and sends it. I pointed it at a free tier HANA Cloud instance, the kind anyone can spin up from the SAP BTP cockpit without paying, and it ran a PCA for real. Getting there took switching on NLP and PAL for the instance, opening the connection to my IP, and creating a separate database user to hold the PAL role, because DBADMIN can't grant that role to itself ("grantor and grantee are identical"). Once that was sorted, the PCA ran: client on my laptop, computation in the cloud engine, the scores coming back over the wire.

## How much of this you can run for free

What ran:

- **Store and search.** `REAL_VECTOR(300)` is accepted as a column type, `TO_REAL_VECTOR` loads vectors into it, and `COSINE_SIMILARITY` and `L2DISTANCE` run over them as plain SQL. On a small set of hand-built vectors the nearest neighbour of "cat" came back as "kitten", which is the sanity check I wanted.
- **The query-side embedding.** `VECTOR_EMBEDDING(..., 'QUERY', 'SAP_GXY.20250407')` returns a usable vector once NLP is switched on for the instance.
- **PCA**, as above.

What didn't:

- **Chunking and the chunk embeddings.** `TextSplitter` fails with `_SYS_AFL.AFLPAL:TEXTSPLIT_ANY ... Function not supported by pal-service`. I read that as a service being switched off. It isn't. More on that below.
- **The cross-encoder**, with a plain `258 insufficient privilege`. Same cause as the chunking, most likely, though the error doesn't say so.
- **Generate.** `AI_TEXT_COMPLETION` needs a remote source pointing at SAP AI Core.
- **The knowledge graph.** The free tier restrictions say the knowledge graph engine "is not supported" and the Triple Store option "cannot be enabled".

### Why PAL runs a PCA but not a text splitter

PAL, the library that ran the PCA earlier in this post, doesn't live inside the database process. It runs in a companion process called the Script Server, which is what actually executes SAP's algorithm libraries. On a paid instance you switch the Script Server on and you get all of PAL. But a free tier instance is 1 vCPU and 16 GB, and a Script Server wants another 16 GB on top of that, so a free instance can't have one at all.

What it gets instead is a smaller, separate capability, offered in the provisioning options under the name Predictive Analysis Library and described in the docs as "limited Predictive Analysis Library (PAL) functionalities for Free Tier instances. Available for Free Tier instances only." So the error meant the function isn't in the cut-down set. Both the PCA and the text splitter are PAL; only one of them made it into the free version.

The Document Store and the Triple Store cost another 16 GB each, so a free instance gets neither. That's the knowledge graph gone, for the same reason. What's left is what sits in the database process itself: the vector column type, the distance functions, the NLP model behind `VECTOR_EMBEDDING`, and the cut-down PAL.

What's in the free set changes between releases. SAP's own wording is that new PAL functions "may not become available for free tier instances until a subsequent release", so the list above is what I found in July 2026, not a permanent boundary.

If you want to reproduce the whole pipeline, you need a paid instance. If you want to convince yourself that vectors and similarity search really are just columns and SQL, free tier is enough.

## Sources

- [SAP HANA Cloud Vector Engine Guide](https://help.sap.com/docs/hana-cloud-database/sap-hana-cloud-sap-hana-database-vector-engine-guide/sap-hana-cloud-sap-hana-database-vector-engine-guide)
- [Cross Encoder Model (PAL): SAP Help](https://help.sap.com/docs/hana-cloud-database/sap-hana-cloud-sap-hana-database-predictive-analysis-library/cross-encoder-model)
- [SAP HANA Cloud Knowledge Graph Engine Guide](https://help.sap.com/docs/hana-cloud-database/sap-hana-cloud-sap-hana-database-knowledge-graph-guide/sap-hana-cloud-sap-hana-database-knowledge-graph-engine-guide)
- [New Cross Encoder and Text Embedding in HANA NLP, 2025 Q4](https://community.sap.com/t5/technology-blog-posts-by-sap/new-cross-encoder-and-text-embedding-support-dimensionality-reduction-in/ba-p/14293164)
- [SAP HANA Database License (free tier restrictions)](https://help.sap.com/docs/hana-cloud/sap-hana-cloud-administration-guide/sap-hana-database-license)
- [SAP HANA Database Additional Features (NLP, Script Server, Triple Store, PAL for free tier)](https://help.sap.com/docs/hana-cloud/sap-hana-cloud-administration-guide/sap-hana-database-additional-features)
