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

## The same trick with a vision model, playing Mario

After the emails I wanted to see the same thing with images, so I swapped the model for Qwen3-VL 4B (with mlx-vlm) and put it to play Super Mario Bros. For every decision the model gets the current frame and three yes/no questions: is there an enemy, a green pipe or a hole close to Mario, on his right side? If any "yes" goes above 30% Mario jumps, otherwise he walks.

<video controls muted playsinline preload="metadata" style="width:100%;max-width:540px" src="/assets/img/jev-style-decisions-open-model-python/mario.mp4"></video>

It jumps over the first Goomba, gets over the four pipes and then falls in the first hole, with the "hole" question at 2%.

Two things that I had to change on the way:

- My first version asked "right, jump or left?" and the model answered "right" with 96%, even with the Goomba right in front of Mario.
- A single question for the three dangers gave 1% with Mario standing against a pipe, while asking only for the pipe gave 100%. That is why there is one question per danger.

Each question takes 0.34 s, so a decision is about one second and the emulator waits while the model answers (the video is not real time). The 30% I picked by eye after looking at a few frames.

This is one question on one frame. You need `pip install mlx-vlm` and the download is around 3 GB:

```python
import mlx.core as mx
from mlx_vlm import load
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import prepare_inputs
from PIL import Image

model, processor = load("mlx-community/Qwen3-VL-4B-Instruct-4bit")

image = Image.open("frame.png")
question = ("This is a frame of Super Mario Bros. Is there an enemy on the ground "
            "close to Mario, on his right side? Answer yes or no.")

prompt = apply_chat_template(processor, model.config, question, num_images=1)
inputs = prepare_inputs(processor, images=[image], prompts=prompt)
extra = {k: v for k, v in inputs.items() if k not in ("input_ids", "pixel_values", "attention_mask")}
scores = model(inputs["input_ids"], inputs["pixel_values"], inputs["attention_mask"], **extra).logits[0, -1]
ids = [processor.tokenizer.encode(o, add_special_tokens=False)[0] for o in ("yes", "no")]
p_yes = mx.softmax(scores[mx.array(ids)])[0].item()

print(f"enemy: {p_yes:.0%}")
```

On a frame with the first Goomba in front of Mario it prints `enemy: 50%`. The game itself runs on `gym-super-mario-bros`, and the loop around this is: ask the three questions, hold the jump button for 20 frames or walk for 8, repeat.

## Some ideas that I had while doing this

- LoRA fine-tuning on a mix of public classification tasks, this should improve the numbers.
- The vision version on something from SAP: a photo of a pallet at goods receipt, with the options "ok" and "damaged".
- Add a "calibration" value. If we divide the scores by a single number before the softmax, the percentages get less extreme and the winner stays the same. You tune that number on a separate set of emails until an 85% really means the model is right 85% of the time.
- Yes/no questions and scores: at the end, yes/no is the same thing with two options. For a score from 1 to 5 you read the five number tokens and take the weighted average.
- Many questions on one email. The email is computed once and each question adds a small cost.
