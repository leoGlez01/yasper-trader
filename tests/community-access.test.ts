import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasCommunityAccess,
  isCommunityRemovalDue,
  type CommunitySubscription,
} from "../lib/community-access";
import { isCommunityPaymentOutstanding } from "../lib/community-report";

const NOW = Date.parse("2026-11-14T12:00:00.000Z");

function subscription(overrides: Partial<CommunitySubscription> = {}): CommunitySubscription {
  return {
    person_id: "person-1",
    stripe_subscription_id: "sub-1",
    status: "active",
    livemode: true,
    current_period_end: new Date(NOW + 24 * 60 * 60 * 1000).toISOString(),
    last_payment_failed_at: null,
    ...overrides,
  };
}

describe("community subscription access", () => {
  it("only grants access for live subscriptions", () => {
    assert.equal(hasCommunityAccess([subscription()], NOW), true);
    assert.equal(hasCommunityAccess([subscription({ livemode: false })], NOW), false);
  });

  it("keeps a failed subscription in the group for less than 72 hours", () => {
    const row = subscription({
      status: "past_due",
      last_payment_failed_at: new Date(NOW - 71 * 60 * 60 * 1000).toISOString(),
    });

    assert.equal(hasCommunityAccess([row], NOW), true);
    assert.equal(isCommunityRemovalDue([row], NOW), false);
    assert.equal(isCommunityPaymentOutstanding([row], NOW), true);
  });

  it("applies the same grace period while Stripe marks a subscription unpaid", () => {
    const row = subscription({
      status: "unpaid",
      last_payment_failed_at: new Date(NOW - 48 * 60 * 60 * 1000).toISOString(),
    });

    assert.equal(hasCommunityAccess([row], NOW), true);
    assert.equal(isCommunityRemovalDue([row], NOW), false);
  });

  it("removes access at 72 hours and does not remove someone with another active subscription", () => {
    const overdue = subscription({
      status: "past_due",
      last_payment_failed_at: new Date(NOW - 72 * 60 * 60 * 1000).toISOString(),
    });

    assert.equal(hasCommunityAccess([overdue], NOW), false);
    assert.equal(isCommunityRemovalDue([overdue], NOW), true);
    assert.equal(isCommunityRemovalDue([overdue, subscription({ stripe_subscription_id: "sub-2" })], NOW), false);
  });

  it("reports current group members without a real paid subscription", () => {
    assert.equal(isCommunityPaymentOutstanding([], NOW), true);
    assert.equal(isCommunityPaymentOutstanding([subscription()], NOW), false);
  });
});
