---
layout: post
title: "How to get Jev-style decisions from an open model in under 20 lines of Python"
date: 2026-10-08
image: /assets/og/jev-style-decisions-open-model-python.png
---

Models like Jev or the OpenAI Decisions API return a decision and a probability instead of text. Even if we don't know (yet?) much about Jev's architecture, I was wondering if I could replicate the idea with an open model.

A language model reads text and gives a score to every token that can come next, and then the chat is a loop on top of that. But for a decision you run the model once and read the scores.

## The steps

1. Load an open model. I used Qwen3 4B in 4-bit with mlx-lm. The download is 2.5 GB.
2. Put the text, the question and the options in one prompt. End with "Answer with one word."
3. Run the model once and generate nothing. It returns 151,936 scores, one for each token in its vocabulary.
4. Keep the scores of your options and apply softmax. You have a probability for each option.

The core is four lines:

```python
tokens = tok.apply_chat_template([{"role": "user", "content": text}], add_generation_prompt=True)
scores = model(mx.array([tokens]))[0, -1]
ids = [tok.encode(o, add_special_tokens=False)[0] for o in options]
probs = mx.softmax(scores[mx.array(ids)])
```

The code only looks at the first token of each option, so every option has to be a single token. "invoice", "payment" and "bank" are, but "dispute" gets split in two and the model would only see the first half. When that happens I label the options A, B, C and ask for a letter instead, which is what I did with the seven AP queues.

## The full code

You need a Mac with Apple Silicon and `pip install mlx-lm`. The first run downloads the model.

```python
import mlx.core as mx
from mlx_lm import load

model, tok = load("mlx-community/Qwen3-4B-Instruct-2507-4bit")

email = "Hi, we sent invoice 4471 six weeks ago. When will it be paid?"
options = ["invoice", "payment", "bank"]  # each one is a single token
text = (f"{email}\n\nWhich queue handles this email?\n"
        "- invoice: sends a new invoice\n"
        "- payment: asks when an invoice will be paid\n"
        "- bank: asks to change the bank account\n\n"
        "Answer with one word.")

tokens = tok.apply_chat_template([{"role": "user", "content": text}], add_generation_prompt=True)
scores = model(mx.array([tokens]))[0, -1]  # one pass, no generation
ids = [tok.encode(o, add_special_tokens=False)[0] for o in options]
probs = mx.softmax(scores[mx.array(ids)]).tolist()

for option, p in zip(options, probs):
    print(f"{option:>8}  {p:.1%}")
```

This is what it prints:

```
 invoice  0.0%
 payment  100.0%
    bank  0.0%
```

## The test

I ran it on the 140 synthetic supplier emails of an SAP Accounts Payable inbox that I used for the [Jev test](/2026/09/21/jev-vs-openai-sap-ap-inbox.html):

- With the "house rules" of the AP team in the prompt: 82% correct. Jev got 100%.
- Without the rules, on the 40 emails where a rule decides: 60%. Jev got 83%.

0.4 s for each email, one at a time, and with no API cost.

The model was 100.0% sure on the email above, and across the 140 emails its mean confidence was 98.5% while it was right 82% of the time.

## Some ideas that I had while doing this

- LoRA fine-tuning on a mix of public classification tasks, this should improve the numbers.
- Test with a vision model: a photo of a pallet at goods receipt, with the options "ok" and "damaged".
- Add a "calibration" value. If we divide the scores by a single number before the softmax, the percentages get less extreme and the winner stays the same. You tune that number on a separate set of emails until an 85% really means the model is right 85% of the time.
- Yes/no questions and scores: at the end, yes/no is the same thing with two options. For a score from 1 to 5 you read the five number tokens and take the weighted average.
- Many questions on one email. The email is computed once and each question adds a small cost.
