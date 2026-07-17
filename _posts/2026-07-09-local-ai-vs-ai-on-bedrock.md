---
layout: post
title: "Local AI vs. AI on Bedrock: a real test"
date: 2026-07-09
original_publication: Code10 blog
original_date: 2026-07-09
original_url: https://code10it.com/local-ai-vs-amazon-bedrock-cost-privacy-test/
---

"Can we run this on our own infrastructure, without sending data to a third party?" comes up more and more in projects where an ERP is involved. We have an NVIDIA DGX Spark at the office, so I set up a concrete test with real numbers: running [**Google's Gemma 4**](https://deepmind.google/models/gemma/gemma-4/) locally, compared with running the same model on Amazon Bedrock.

## What I didn't test (on purpose)

If the task were "extract vendor, invoice number, line items and totals from a PDF with a known layout" I wouldn't use a language model at all. I'd use Textract, Azure AI Document Intelligence (formerly Form Recognizer), or plain layout rules: faster, cheaper, deterministic, and it doesn't depend on a model "interpreting" a value that sits in a fixed position on the document. Using an LLM for that is like using a jackhammer to hang a picture.

## The task worth testing

An LLM starts to earn its place where classic extraction tools fall short: when there's a free-text note that needs interpreting, with no dedicated field for it. I built several synthetic invoices (made-up data), each with an observations line describing a different edge case: a partial delivery, access details the courier needs for the delivery, units still pending receipt, none of it in a structured field.

I asked Gemma 4 31B to return a JSON with the invoice fields plus an `alerts` field for any discrepancy found in the free text. That's judgment on unstructured content, the kind of task a human still does today by reading the full invoice during a three-way match check.

### Round 1: local, on the Spark

I installed Ollama, pulled `gemma4:31b` (20 GB), and ran the prompt against the local API.

Across the examples it extracted every field correctly, and in `alerts` it flagged things like the partial delivery and the pending units, reading them from free text rather than a dedicated field. The results were right. The timing, less so. For a representative invoice:

- **Model load on GPU** (first run): ~35 seconds
- **Response generation:** ~168 seconds, at ~10 tokens/second
- **Total:** ~3 minutes 20 seconds for one invoice

One number didn't add up: the visible answer is ~1,150 characters, but the model generated ~1,720 tokens to get there. I repeated the extraction on the other invoices and also tried a plain-text prompt with no JSON and no numbers, and in every case the token-to-character ratio stayed odd. `ollama show` revealed the cause: `gemma4:31b` ships with "thinking" on by default. It generates internal reasoning before the answer (in one run, even in English, despite the prompt being in Spanish), and that reasoning consumes time and tokens without showing up in the final output.

I repeated the extraction with `think: false`: same results, alerts included, in about 1 minute instead of 3 minutes 20 seconds. Roughly **3.4x faster**, at the same per-token generation speed. The entire difference was hidden reasoning that added nothing to this specific task. Worth testing that option before accepting a model's default latency as final.

### Round 2: the same model, on Bedrock

Gemma 4 31B has been available on Amazon Bedrock since June 2026, in four regions including Europe (Frankfurt). That makes for a comparison without cross-tokenizer guesswork: same model, two ways of running it. (On Bedrock the reasoning mode is off by default, which matches the `think: false` run above.)

Bedrock charges ~$0.12 / $0.35 per million input/output tokens for this model. With the actual token counts I measured (883 input, 621 output per invoice), 100 invoices cost about **$0.03**.

In a company, "running this yourself" means a cloud GPU instance, not buying a DGX Spark: for example a `g6.xlarge` on AWS (L4 GPU, 24 GB, enough to run this model), at about $0.80/hour. Processing 100 invoices there, even in the best possible case (the GPU busy 100% of the time with no idle seconds, which isn't realistic for small, sporadic batches), costs about **$1.34** (about 40 times more expensive than the same model on Bedrock).

The reason is simple: a cloud provider spreads that GPU's cost across thousands of customers. Your own instance, if you buy or rent it yourself, gets billed in full even if you use it five minutes a day.

## The fine print of "the data doesn't leave my network"

This is usually where the conversation stops ("I'll run something local and call it done"), and where it's worth looking a bit closer. Two things I confirmed:

**Bedrock doesn't automatically move your data out of the EU.** How data is routed depends on how you invoke the model, and there are three distinct modes:

- **Regional model ID (in-region): this is the default.** The request never leaves the Region you call. There's nothing to configure: unless you explicitly opt into something else, processing stays in your home Region.
- **EU geographic inference profile (`eu.` prefix).** Requests can be balanced across AWS Regions, but only *within* the EU (Frankfurt, Ireland, Paris). The data still doesn't leave the EU. This is AWS's recommended option for EU data residency, and for some newer models it's the only way to run them on-demand.
- **Global inference profile (`global.` prefix).** Requests can be routed to AWS commercial Regions worldwide, including the US. This is the only mode that actually takes data out of the EU, and it's explicitly opt-in.

**So "cross-region" is not a synonym for "leaves the EU"**: the EU profile keeps everything within the EU, and only the global profile crosses that boundary. Two caveats worth knowing: when a cross-region profile is used and the model is subject to abuse detection, AWS may store prompts and outputs in the destination Region (not just transit them in memory); and AWS states it doesn't store your inputs and outputs, use them to train models, or share them with third-party model providers, in any mode.

A related point that people often miss: an EU Region of a US-headquartered provider solves *geographic* residency, but the data can still fall under US jurisdiction (e.g. the CLOUD Act). That's a different axis from "which country the servers are in," and it's part of why "no third parties" and "in the EU" aren't the same requirement. (Not legal advice… validate with your compliance team.)

**"GDPR-compliant" and "the data never touches third-party infrastructure" aren't the same thing.** Bedrock in Frankfurt, properly configured, solves geographic residency (the data is processed and stored in the EU), which is what GDPR asks for in most cases. It doesn't solve a different, stricter requirement: that the data never passes through infrastructure you don't control, regardless of country. That second requirement shows up in contracts with "no subprocessors" clauses, in some regulated sectors (defense, certain public bodies), or with clients who simply don't trust a third-party cloud beyond what's written on paper. None of this is legal advice: each case needs to be validated with the relevant compliance team, but the distinction between "in the EU" and "on my own infrastructure" is what in practice decides whether Bedrock is enough.

## So when does running this locally actually make sense?

Given the numbers above, almost never for cost reasons: a model hosted in your own region, properly configured, already meets most real regulatory requirements at a fraction of the price. The cases where running locally (or on your own private cloud) still makes sense are narrower than the "open models" narrative suggests:

- **The contractual or regulatory requirement is literally "no third parties,"** not "in this region": defense, certain public bodies, or no-subprocessor clauses that Bedrock can't satisfy in any configuration.
- **The environment has no reliable connectivity or is air-gapped by design** (industrial plants, OT environments, remote sites).
- **You already run the GPU infrastructure for another reason** (you're not buying it just for this), so the marginal cost of adding this workload is low and the comparison above no longer applies.

Outside those cases, before justifying your own hardware it's worth checking whether the real requirement is about region or about third parties. Those are different things, and buying a GPU only solves the second one.

## Sources

- [Geographic cross-Region inference — Amazon Bedrock User Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html)
- [Global cross-Region inference — Amazon Bedrock User Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html)
- [Increase throughput with cross-Region inference — Amazon Bedrock User Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html)
- [Unlocking AI flexibility in Europe: a guide to cross-region inference for EU data processing — AWS Machine Learning Blog](https://aws.amazon.com/blogs/machine-learning/unlocking-ai-flexibility-in-europe-a-guide-to-cross-region-inference-for-eu-data-processing-and-model-access/)
- [Data protection — Amazon Bedrock User Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)
- [How Amazon Bedrock uses model input and output data — AWS re:Post](https://repost.aws/knowledge-center/amazon-bedrock-model-data-use)
