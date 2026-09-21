---
layout: post
title: "I ran Jev against two OpenAI models on an SAP Accounts Payable inbox"
date: 2026-09-21
image: /assets/og/jev-vs-openai-sap-ap-inbox.png
---

TypeSafe released Jev on 15 September 2026. Jev does not write text. You send it a context and questions with fixed answers. It returns the answer it picks, a probability for each option and a confidence value. TypeSafe says it is 20 to 200 times faster and 40 to 400 times cheaper than an LLM.

I got access on 19 September. I built a small test on a process I know: the supplier inbox of an SAP Accounts Payable team.

## The test

I generated 140 synthetic emails with an AI assistant. Each email was written for a known queue. There are 7 queues:

- invoice submission
- payment status
- price or quantity dispute
- bank details change
- duplicate payment
- vendor master update
- no action

There are 20 emails per queue. 105 are in English and 35 are in Spanish. They contain SAP-style PO numbers, vendor numbers, IBANs, forwarded chains and a few OCR errors.

40 of the emails are traps. In each trap, a house rule of the AP team overrides the obvious reading. Three examples:

- R1. A new IBAN inside an invoice email goes to the bank details queue for a fraud check. Invoice processing never sees it.
- R3. A credit memo that corrects a price difference the supplier already agreed belongs to invoice submission. The dispute queue stays out of it.
- R4. A payment-status question that also complains about a short payment counts as a dispute.

I sent every email to three models:

- **Jev** (`jev-1.13.0`), one Choice question for the queue and one Noul question for "asks to pay into a different bank account".
- **gpt-5.6-luna**, the cheapest OpenAI model, with reasoning effort `none`, its fastest setting. Structured JSON output restricted to the same 7 queues.
- **gpt-6-astra**, the model TypeSafe uses as its reference, with reasoning effort `low`, the lowest it accepts. I ran it once because it is expensive.

I ran each case two ways: with the five house rules in the request, and without them. Jev and luna ran 3 times each, with 8 parallel requests, from my laptop in Spain.

![Jev and gpt-5.6-luna replayed side by side at 7.85 seconds into the run](/assets/img/jev-vs-openai-sap-ap-inbox/frame-race.png)

## Results with the house rules

| | Jev | gpt-5.6-luna | gpt-6-astra |
|---|---|---|---|
| Accuracy | 100% (420/420) | 99.8% (419/420) | 100% (140/140) |
| Time for 140 emails | 8.6 s | 19.0 s | 30.1 s |
| Median latency per email | 338 ms | 1,007 ms | 1,570 ms |
| Cost per 10,000 emails | $0.32 | $1.19 | $57.48 |

All three models classified the inbox correctly when the rules were in the request. The differences are time and cost.

Against luna, Jev was 2.2 times faster and 3.7 times cheaper. Against astra, Jev was 3.5 times faster and 177 times cheaper. The large multipliers in the launch material come from the comparison with the large models. The gap against the cheapest OpenAI model is much smaller.

![With the house rules: Jev 2.2x faster, 3.7x cheaper, 100% accuracy, $0.32 per 10,000 emails](/assets/img/jev-vs-openai-sap-ap-inbox/card-with-rules.png)

Three details about the numbers:

- TypeSafe's docs say "about 100 ms" per call. From Spain I measured a median of 338 ms, with a slow tail. 10% of calls took more than 800 ms. The network to the US explains most of it.
- Jev counted 771 input tokens per email. OpenAI counted 475 for the same email and rules. Jev is still cheaper because output tokens are free and the input price is $0.042 per million.
- Spanish emails were not a problem here. Jev got all 35 right with the rules, and 97% without them.

## Results without the house rules

On the 100 clear emails, Jev was still perfect (300/300 over 3 runs). Luna made 3 errors. The traps behave differently:

| Trap accuracy, no rules | Jev | gpt-5.6-luna | gpt-6-astra |
|---|---|---|---|
| All 40 traps | 83% | 74% | 97.5% |
| R3, agreed credit memo | 16/24 | 6/24 | 7/8 |
| R4, status question plus short payment | 12/24 | 16/24 | 8/8 |

Astra got almost every trap right with no rules at all. It seems to know how an AP department works. Jev and luna read the surface of the email.

Email E004 shows the problem. The subject is "Qty/price mismatch invoice 51877". The body says the supplier agreed the lower price, and a credit memo is attached. Without the rule, Jev put it in the dispute queue with confidence 1.00, in all 3 runs. With the rule, Jev put it in the invoice queue with confidence 0.85, also in all 3 runs.

Jev's confidence helped with most errors. Without the rules, Jev gave 20 wrong answers in 420. 14 of them (70%) came back under 0.8, so a threshold at 0.8 sends them to a person. 5 wrong answers came back above 0.9. All 5 came from two emails that need a house rule.

![Without the house rules: Jev 83.3% on the 40 traps, luna 74.2%, astra 97.5%](/assets/img/jev-vs-openai-sap-ap-inbox/card-without-rules.png)

Paweł Huryn found the same pattern in his own test of support messages. Confidence shows when the text is ambiguous. It stays high when a rule is missing from the request.

## What I take from this

For an SAP team, the useful part of Jev is the shape of the answer. A queue, a probability per queue and a confidence value go straight into a workflow rule: route automatically above 0.8, send to a person below it. My luna call returned the queue alone, with no measure of doubt.

The cost argument depends on the baseline. At 140 emails a day, luna costs about $6 a year. Jev costs less than $2. That difference does not decide a project. At millions of decisions a day, or inside an agent loop that makes a decision at each step, it does.

The speed argument is stronger. 338 ms against 1 second per decision matters in an agent that makes 30 decisions per task. It matters less in a batch job overnight.

The house rules must be written down and sent with every request. The same applies to luna. The large model covered for the missing rules, at 177 times the cost of Jev. A written rule costs nothing.

Limits of this test: the data is synthetic and the labels come from how the emails were written. 140 emails is a small sample. The clear cases were easy for all three models. I did not test adversarial emails or long email chains.

## Sources

- [TypeSafe docs](https://docs.typesafe.ai)
- [Jev 1.13 known weaknesses](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- [Paweł Huryn's test](https://x.com/PawelHuryn/status/2101213026204401921)
