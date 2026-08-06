---
layout: post
title: "SAP Document AI won't subscribe on a BTP trial: error 422, OIDC trust missing"
date: 2026-08-06
image: /assets/og/sap-document-ai-btp-trial-oidc-trust.png
---

You try to subscribe to SAP Document AI on a BTP trial account, and the subscription fails. The cockpit shows a red badge and a message that sounds like it belongs to a different problem:

> You haven't configured your subaccount (for business users) to trust a tenant of SAP Cloud Identity Services using OpenID Connect. SAML trust isn't supported for this service. To subscribe this application, use the Establish Trust option to configure trust between your subaccount and SAP Cloud Identity Services.
>
> Error Code: 422  
> OIDC trust missing

![Subscription Failed](/assets/img/sap-document-ai-btp-trial-oidc-trust/03-subscription-failed.jpg)

![Error Code 422, OIDC trust missing](/assets/img/sap-document-ai-btp-trial-oidc-trust/04-error-422-oidc-trust-missing.jpg)

The message is accurate but the thing it tells you to configure does not exist yet!

## The obvious check misleads you

Go to Security -> Trust Configuration. 
A fresh trial subaccount has exactly one entry: `Default identity provider`, origin key `sap.default`, protocol **OpenID Connect**.

![Trust Configuration before](/assets/img/sap-document-ai-btp-trial-oidc-trust/01-trust-configuration-before.jpg)

That column says OpenID Connect, so it looks like the requirement is already met. It isn't. `sap.default` is SAP ID Service, which is not a tenant of SAP Cloud Identity Services. Document AI checks for the second thing specifically.

Click **Establish Trust**, the button the error message recommends, and you get the real diagnosis:

![No tenants available](/assets/img/sap-document-ai-btp-trial-oidc-trust/05-no-tenants-available.jpg)

No tenants available. There is nothing to trust because a trial account ships without an Identity Authentication tenant.

## The fix

### 1. Subscribe to Cloud Identity Services

In your subaccount, go to Service Marketplace and search for `identity`.

![Service Marketplace, identity](/assets/img/sap-document-ai-btp-trial-oidc-trust/06-marketplace-identity.jpg)

Open **Cloud Identity Services**. The tile you want is under **Application Plans**, plan `default`. Trial accounts get 2 units of it.

![Cloud Identity Services plans](/assets/img/sap-document-ai-btp-trial-oidc-trust/07-cloud-identity-services-plans.jpg)

Choose Create, pick service **Cloud Identity Services** and plan **default** (the one under Subscriptions, not the `application` one under Instances).

![New subscription, plan default](/assets/img/sap-document-ai-btp-trial-oidc-trust/08-new-subscription-plan-default.jpg)

Click Next. There is a single parameter, **Service type**, and the default value `PRODUCTIVE` is the one you want. The other option is `TEST`, which provisions a test tenant.

![Parameters, service type](/assets/img/sap-document-ai-btp-trial-oidc-trust/09-parameters-service-type.jpg)

Create it. This took under a minute.

![Cloud Identity Services subscribed](/assets/img/sap-document-ai-btp-trial-oidc-trust/10-cloud-identity-services-subscribed.jpg)

This subscription provisions an Identity Authentication tenant for you. There is no separate onboarding wizard to run, no email to wait for, no ticket to raise. If you open the tenant's admin console it will ask you to log in, but you do not need to do that for any of what follows.

### 2. Establish the trust

Back to Security, then Trust Configuration, then **Establish Trust**. The tenant that did not exist five minutes ago is now in the list.

![Wizard step 1, choose tenant](/assets/img/sap-document-ai-btp-trial-oidc-trust/11-wizard-1-choose-tenant.jpg)

Select it and click through. Every default in the remaining three steps is correct for this scenario.

Step 2 fills in a name and the origin key `sap.custom`:

![Wizard step 2, main information](/assets/img/sap-document-ai-btp-trial-oidc-trust/12-wizard-2-main-information.jpg)

Step 3 sets the domain to Default, marks the provider available for user logon, and creates shadow users on logon:

![Wizard step 3, identity provider and parameters](/assets/img/sap-document-ai-btp-trial-oidc-trust/13-wizard-3-idp-and-parameters.jpg)

Step 4 is a review. Click Finish.

![Wizard step 4, review](/assets/img/sap-document-ai-btp-trial-oidc-trust/14-wizard-4-review.jpg)

Trust Configuration now has a second section, **Custom Identity Provider for Applications**, and the cockpit confirms the setup with a banner.

![Trust Configuration after](/assets/img/sap-document-ai-btp-trial-oidc-trust/15-trust-configuration-after.jpg)

### 3. Delete the failed subscription and retry

The failed subscription does not repair itself, and there is no retry action. The only entry in its context menu is Delete. The confirmation dialog says as much:

> We encountered an error while creating your subscription so it may not work properly. You can delete it and try again.

![Delete failed subscription](/assets/img/sap-document-ai-btp-trial-oidc-trust/16-delete-failed-subscription.jpg)

Delete it, then create the subscription again the same way you did the first time: service **SAP Document AI**, plan **default**.

![SAP Document AI subscribed](/assets/img/sap-document-ai-btp-trial-oidc-trust/17-document-ai-subscribed.jpg)

Subscribed.

## Subscribed is not the same as working

Open the application and you get a second Permission Denied:

> Subaccount contains no instance of the SAP Document AI service.

The trust was one of three gates, not the only one. Each gate reports a different error, and none of them mentions the next.

### 4. Create the service instance

What you subscribed to is the UI application. It needs a service instance behind it to know which backend to talk to, and that instance is a separate object you create yourself.

Choose Create, then service **SAP Document AI Trial** (`document-information-extraction-trial`, the other of the two lookalikes). It offers two plans:

![Instance plan options](/assets/img/sap-document-ai-btp-trial-oidc-trust/18-instance-plan-options.jpg)

Take `default`. Once you pick a plan, three more fields appear: runtime environment, space, and a name. Cloud Foundry and the `dev` space that trial creates for you are both fine, and the name is yours to choose.

![Runtime environment, space and instance name](/assets/img/sap-document-ai-btp-trial-oidc-trust/19-instance-runtime-space-name.jpg)

![Creation in progress](/assets/img/sap-document-ai-btp-trial-oidc-trust/20-instance-creation-in-progress.jpg)

Like the subscription, this sits on Creation in Progress for a few minutes.

### 5. Assign the role collections, to the right user

With the instance in place the app gets further and then stops again:

![Permission denied, assign roles](/assets/img/sap-document-ai-btp-trial-oidc-trust/21-permission-denied-roles.jpg)

> Ask your administrator to provide access to the application by assigning relevant roles.

Security, then Role Collections. Document AI ships three:

![Document AI role collections](/assets/img/sap-document-ai-btp-trial-oidc-trust/22-document-ai-role-collections.jpg)

Here is the part that costs people an afternoon. Go to Security, then Users, and look at what the OIDC trust did to your user list:

![The same email under two identity providers](/assets/img/sap-document-ai-btp-trial-oidc-trust/23-same-email-two-identity-providers.jpg)

The same email address appears twice, once under `Default identity provider` and once under your Identity Authentication tenant. They are two separate user records. Assigning role collections to the `sap.default` one changes nothing for the application, because after step 2 the application authenticates against the tenant. Nothing errors, nothing warns you, and you keep getting Permission Denied.

Open the tenant one, whose Role Collections list starts out empty, and assign all three.

![Assign role collections](/assets/img/sap-document-ai-btp-trial-oidc-trust/24-assign-role-collections.jpg)

![Role collections assigned](/assets/img/sap-document-ai-btp-trial-oidc-trust/25-role-collections-assigned.jpg)

Then sign out and sign in again. The roles are read when the token is issued, so the session you already have will not pick them up. You will notice the sign-in page now belongs to your tenant (`<tenant>.trial-accounts.ondemand.com/oauth2/authorize`) rather than to SAP ID Service, which is the trust from step 2 doing its job.

## Notes

**Nothing here costs money.** A BTP trial has no payment method attached, so nothing in the trial marketplace can generate a charge. The "2 units" on the Cloud Identity Services plan are trial entitlements, not credits.

**The tenant is tied to the trial.** Let the trial account expire and the Identity Authentication tenant goes with it. Trial subaccounts also suspend every 30 days and need reactivating from the cockpit.

**The cockpit list goes stale.** The Document AI subscription sat on Processing for several minutes in both accounts I tested. Reload the page rather than trusting the status badge, and give it up to fifteen minutes before assuming something is wrong.

**Two entries look alike in the marketplace, and you need both.** `SAP Document AI` (`document-information-extraction-trial-application-ias`) is the application subscription, the one that needs the OIDC trust. `SAP Document AI Trial` (`document-information-extraction-trial`) is the service instance from step 4. The names suggest you pick one. You don't.

![Document AI application plan](/assets/img/sap-document-ai-btp-trial-oidc-trust/02-document-ai-app-plan.jpg)

**Read the error text, not the badge.** All three failures render as the same red Permission Denied box or the same red Subscription Failed badge. The sentence inside is the only thing that tells you which of the three gates you are standing at.
