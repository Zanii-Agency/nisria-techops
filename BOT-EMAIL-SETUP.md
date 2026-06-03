# Set up bot@nisria.co to read its own email

**What we are doing (in one sentence):**
We make a little "robot helper" inside YOUR Google project, and give it permission
to peek inside the `bot@nisria.co` mailbox, so when Nur emails documents there, the
platform grabs them and files them automatically.

**Which project we use:** `sage-bonus-498011-k8` — this is YOUR project
("My First Project", under nisria.co). You already turned Gmail ON here. ✅
(Forget the old `crack-cogency...` project — that one isn't yours, you can't use it.)

---

## Step 1 — Gmail door: already ON ✅

You already did this. The Gmail API is **Enabled** on `sage-bonus-498011-k8`.
Nothing to do. 🎉

If you ever want to check it again, here is the exact link:
https://console.cloud.google.com/apis/api/gmail.googleapis.com/metrics?project=sage-bonus-498011-k8

---

## Step 2 — Make the robot helper

👉 Click this exact link:
https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=sage-bonus-498011-k8

- In **"Service account name"** type: `bot-email-reader`
- Click the blue **CREATE AND CONTINUE** button.
- It now asks *"Grant this service account access to project"* → **just click CONTINUE** (skip it, leave it empty).
- It asks about users → **click DONE**.

✅ **Done when:** you land back on a list and you see a row called
**`bot-email-reader`** with an email like
`bot-email-reader@sage-bonus-498011-k8.iam.gserviceaccount.com`.

---

## Step 3 — Give the robot its secret key (a file)

- Click on the **`bot-email-reader`** row you just made.
- At the top, click the **"KEYS"** tab.
- Click **"ADD KEY"** → **"Create new key"**.
- Choose **JSON** → click **CREATE**.
- A little file downloads to your computer (it goes to your **Downloads** folder).
  The name looks like `sage-bonus-498011-k8-xxxxxxxx.json`.

✅ **Done when:** that `.json` file is in your Downloads folder. **Do not open it,
do not share it in chat.** Just leave it there — I will pick it up from your
computer myself.

> 🟡 If the **"Create new key"** button is greyed out or gives an error, STOP and
> tell me — there may be a rule blocking keys, and I'll give you a different way.

---

## Step 4 — Copy the robot's ID number

- Still on the `bot-email-reader` page, click the **"DETAILS"** tab.
- Find **"Unique ID"** — a long number like `108234567890123456789`.
- Copy it. (Keep it for Step 5 and to send me.)

✅ **Done when:** you have that long number copied.

---

## Step 5 — Let the robot read bot@'s mail (permission)

👉 Click this exact link:
https://admin.google.com/ac/owl/domainwidedelegation

- This is your **Google Admin** page (where you made `bot@nisria.co`).
- Click **"Add new"**.
- A box pops up with two fields:
  - **"Client ID"** → paste the long number from Step 4.
  - **"OAuth scopes"** → paste exactly this:
    ```
    https://www.googleapis.com/auth/gmail.readonly
    ```
- Click **"Authorize"**.

✅ **Done when:** a new row appears showing that long number with the
`gmail.readonly` scope next to it.

> 🧒 In plain words: you just told Google *"this robot may READ the bot's mailbox,
> nothing else — it can't send, can't delete, can't touch other people's mail."*

---

## Step 6 — Tell me you're done

Send me:
1. The long **Unique ID** number (Step 4).
2. **"key is in Downloads"** (Step 3 done).
3. **"permission added"** (Step 5 done).

Then I:
- Pick up the key file from your computer and store it safely in the platform.
- Build the `/api/email/ingest` pipeline.
- We TEST it: you email a PDF to `bot@nisria.co`, and we watch it appear in the
  platform.

---

## Safety notes (read once)

- 🔑 The robot's **JSON key file** is like a house key — anyone with it can read
  bot@'s mail. Keep it in Downloads, don't email it, don't paste it. I'll move it
  to a safe place and then you can delete the copy in Downloads.
- 🔑 The bot@ **password** from earlier: pop it in your Keychain as a backup. We
  don't use it here (the robot does the work).
- 📬 This only works because `nisria.co` mail lives on Google. If mail ever moves,
  tell me.
