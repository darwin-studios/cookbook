# Get started

Choose [general assistant](../examples/README.md), [shopping](../examples/README.md), or [IDE suggestions](../examples/README.md). Each has matching TypeScript and Python folders and a one-screen README.

## 1. Search without a key

From the cookbook root:

```bash
cd examples/typescript/general-assistant
npm install
npm start
```

Or run `python3 examples/python/general-assistant/main.py` from the cookbook root. Search returns ranked capabilities and route status; it does not contact the agent.

## 2. Optional Search key

Sign in to Darwin, open **Me → Developers**, create an application, then create a Search key. One server-side key per application/environment is enough; it cannot Act for a person. Keep it out of Git and browser bundles. The [Account API](https://darwin.so/docs/admin/account) also exposes application and key creation. No invitation code or event credit allotment has been announced.

## 3. Act with your account

To try a selected route, use the example's OAuth command:

| Language | From the example folder |
| --- | --- |
| TypeScript | `npm run act` |
| Python | `python3 ../shared/oauth.py general-assistant` (use `shopping` for that example) |

Open the printed consent URL, approve your Darwin account, choose the exact capability, review its inputs, and type `yes` before sending. The temporary access token stays in process memory. If the agent returns an authentication or payment request, that is a **new** review; neither happens automatically. A hosted redirect or accepted thread is not a completed result or receipt.

For customer-facing products, register one developer application but connect each person through their own Darwin OAuth grant when they choose to act. Your app's Search key and your personal grant do not grant their authority. [Credential details](api-and-credentials.md) · [Availability and errors](availability-and-verification.md)
