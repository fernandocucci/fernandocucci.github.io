---
layout: post
title: "Humans vs. SAP-RPT-1: how we built a live prediction challenge for AUSAPE"
date: 2026-06-10
original_publication: Code10 blog
original_date: 2026-06-10
original_url: https://code10it.com/humans-vs-sap-rpt-1-how-we-built-a-live-prediction-challenge-for-ausape/
---

At AUSAPE this year we set up a small experiment on the Code10 stand: a live prediction challenge, **humans vs. SAP-RPT-1**, SAP's foundation model for relational data.

We showed a case from a real dataset, people guessed the outcome, and then we asked the model to do the same. After almost 70 rounds, the humans won: **67% vs. 54%**.

That result got a few laughs and a lot of questions. The one I kept getting was: *how did you actually build this?* So, here's the technical walkthrough: what RPT-1 is, how we ran it on the show floor, and where a model like this makes sense in production.

## What SAP-RPT-1 is (and why it's interesting)

Most predictive models you've worked with are trained for one job: you take a dataset, train a model on it, and that model only knows that problem. Train again for the next dataset.

RPT-1 takes a different approach: the same idea behind large language models, applied to tables. You don't train it per dataset. You hand it a set of example rows as *context*, then give it a new row and ask it to predict the missing value. No gradient updates, no fine-tuning. The model generalizes the examples in front of it. This is usually called **in-context learning**, and RPT-1 brings it to structured, relational data.

Two things make this notable coming from SAP. First, it's based on a paper they published: [**ConTextTab**](https://arxiv.org/abs/2506.10707), a **spotlight paper at NeurIPS 2025,** peer-reviewed research behind a product release, which is not something you see every day in enterprise software. Second, they put the implementation on Hugging Face as [**sap-rpt-1-oss**](https://huggingface.co/SAP/sap-rpt-1-oss) under an Apache 2.0 license. One caveat worth knowing for enterprise use: the open-source checkpoints are intended for research, they inherit restrictions from their training data (so they aren't a drop-in for production). For that, SAP offers hosted versions through SAP AI Core (the hosted line has since moved on to RPT-1.5). Even so, having an open implementation to download is what let us build a demo in days instead of months.

## The architecture

The setup had three moving parts:

- **Frontend**: the stand UI where people played, hosted on AWS.
- **Backend**: a FastAPI service holding the game logic (datasets, rounds, scoring), also on AWS.
- **Inference**: a separate service wrapping the model, running locally on an **NVIDIA DGX Spark (Founders Edition)**.

Why keep inference separate? Because RPT-1 is built to run on a GPU. SAP recommends a GPU with 80 GB of memory for the full context size, though the lightweight configuration we used (more on that below) brings the requirement down a lot. We already had an NVIDIA DGX Spark in the office that we use for experiments, so for a two-day event it made sense to run inference there instead of paying for a GPU instance in the cloud. The backend just called it over a simple HTTPS endpoint, and the scoreboard went to AWS **S3**.

That separation is also good practice in general: the model service does one thing (predict), and the application around it doesn't care whether the model runs locally, in the cloud, or behind SAP's hosted API. Swapping one for the other is a config change.

## How prediction actually works

The open-source model exposes a familiar, scikit-learn-style interface. The thing to notice is that `fit()` isn't training; it's just handing over the context rows.

```python
from sap_rpt_oss import SAP_RPT_OSS_Classifier

clf = SAP_RPT_OSS_Classifier(max_context_size=2048)

# "fit" just loads example rows as context; no training happens here
clf.fit(context_rows, context_labels)

# Predict an unseen case
prediction = clf.predict(new_case)
confidence = clf.predict_proba(new_case)[0].max()
```

If you use the hosted API instead of the local model, the same idea shows up in the request format. You send the context rows and the query row together, and you mark the value you want predicted with a `[PREDICT]` token:

```json
{
  "rows": [
    {"amount": "1200", "country": "ES", "target": "Legit"},
    {"amount": "9900", "country": "RU", "target": "Fraud"},
    {"amount": "4300", "country": "ES", "target": "[PREDICT]"}
  ]
}
```

The model reads the labeled examples and fills in the `[PREDICT]` slot. That's the whole interaction. No training step, no model artifact to manage per dataset.

For the game, we used two public datasets from Kaggle (**bank fraud** and **predictive maintenance**) and split each one 80% as context and 20% as live cases. We ran the **lightweight configuration**: context capped at 2,048 rows with a bagging factor of 1. SAP's docs recommend up to 8,192 rows of context (and bagging 8 for large tables) on an 80 GB GPU, but the lighter settings cut the hardware requirements substantially and were more than enough for a stand game.

## Why the humans won (and why that's not the headline)

It's tempting to read "67% vs. 54%" as "humans beat the AI." They did, in *this* game. But the game was deliberately easy for a human: a single case, a handful of columns, a yes/no guess. With two or three variables on the table, human intuition is hard to beat.

That's not the terrain RPT-1 is built for. It's designed for wide tables (dozens of columns, historical records, relationships across tables) where a person can't hold all the signal in their head. SAP reports up to [**3.5× better performance than a general-purpose LLM**](https://www.sap.com/products/artificial-intelligence/sap-rpt.html) on tabular predictive tasks in that setting (their number, not an independent benchmark). A trade-show guessing game doesn't measure any of that.

So the honest takeaway from the experiment isn't "humans win." It's that the question is never *human or AI*. It's *which one, for which problem*.

## When does a model like RPT-1 make sense in production?

This is the part that matters if you're past the demo. A few rules of thumb from building this:

**It's a strong fit when:**

- You have a tabular/relational prediction problem (churn, fraud, delay, failure risk) with many columns and history.
- You need results fast and don't want to build and maintain a trained model per use case. The in-context approach removes the training pipeline.
- You're in a cold-start situation: a new problem with some labeled examples but not enough to justify a full training effort.

**Be careful when:**

- **Latency and cost matter at scale.** Inference needs a GPU. For a stand that's a one-time box; for a high-volume production path it's a real cost line you have to size.
- **The problem is small or simple.** If a handful of features and a bit of domain logic already solve it, a foundation model is overkill, and as our game showed, not necessarily better.
- **Data governance and licensing are in play.** Two things to check. Sending enterprise rows to a hosted endpoint raises the usual data questions. And the open-source checkpoints are intended for research use (they inherit restrictions from their training data), so they're great for experimentation on your own hardware but not a production answer by themselves. For production you'd use SAP's hosted, licensed version, which is also why the local/cloud split in our architecture matters.

For a lot of enterprise cases, the right answer is still a classic, well-understood model (gradient boosting, for instance). RPT-1 earns its place where the alternative is *no model at all* because training one wasn't worth it. And that's a larger set of problems than it sounds.

## What we'd do differently

The stand version was built for fun and speed. For a real evaluation we'd point it at a genuinely wide enterprise dataset (the kind RPT-1 is meant for), compare it head-to-head against a tuned gradient-boosting baseline, and measure latency and cost under load rather than per click. That's the experiment that would actually tell a client whether to use it.

*Fernando Cucci, Solutions Architect @ Code10*
