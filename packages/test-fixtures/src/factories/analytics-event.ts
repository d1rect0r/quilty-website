/**
 * AnalyticsEventFactory — fixture builder for the
 * `@quilty/observability` AnalyticsEvent typed union.
 *
 * The typed union has six variants; this factory exposes one builder
 * per variant. Each builder generates props that satisfy the variant's
 * Zod-equivalent shape and are HIPAA-safe (no real identifiers, no
 * PHI-shaped fields).
 *
 * Usage:
 *
 *   const event = AnalyticsEventFactory.pageView({ route: '/account' });
 *   const event = AnalyticsEventFactory.signupCompleted({ method: 'passkey' });
 */

import { faker } from '../faker';

export type AnalyticsEventName =
  | 'page_view'
  | 'cta_click'
  | 'signup_started'
  | 'signup_completed'
  | 'subscription_started'
  | 'account_deleted';

export interface PageViewEvent {
  readonly name: 'page_view';
  readonly props: { readonly route: string; readonly locale: string };
}

export interface CtaClickEvent {
  readonly name: 'cta_click';
  readonly props: { readonly cta_id: string; readonly location: string };
}

export interface SignupStartedEvent {
  readonly name: 'signup_started';
  readonly props: { readonly source: string };
}

export interface SignupCompletedEvent {
  readonly name: 'signup_completed';
  readonly props: { readonly method: 'password' | 'passkey' | 'social' };
}

export interface SubscriptionStartedEvent {
  readonly name: 'subscription_started';
  readonly props: { readonly plan: string };
}

export interface AccountDeletedEvent {
  readonly name: 'account_deleted';
  readonly props: { readonly reason: string };
}

export type AnalyticsEventFixture =
  | PageViewEvent
  | CtaClickEvent
  | SignupStartedEvent
  | SignupCompletedEvent
  | SubscriptionStartedEvent
  | AccountDeletedEvent;

const LOCALES = ['en', 'es'] as const;
const ROUTES = ['/', '/en', '/en/about', '/en/contact', '/en/pricing'] as const;
const CTA_LOCATIONS = ['header', 'hero', 'features', 'footer'] as const;
const SIGNUP_SOURCES = ['hero', 'header', 'pricing', 'redirect'] as const;
const SIGNUP_METHODS = ['password', 'passkey', 'social'] as const;
const PLAN_SLUGS = ['monthly', 'annual', 'family'] as const;
const DELETE_REASONS = ['user_request', 'inactive', 'compliance'] as const;

export const AnalyticsEventFactory = {
  pageView(overrides?: Partial<PageViewEvent['props']>): PageViewEvent {
    return {
      name: 'page_view',
      props: {
        route: overrides?.route ?? faker.helpers.arrayElement(ROUTES),
        locale: overrides?.locale ?? faker.helpers.arrayElement(LOCALES),
      },
    };
  },
  ctaClick(overrides?: Partial<CtaClickEvent['props']>): CtaClickEvent {
    return {
      name: 'cta_click',
      props: {
        cta_id: overrides?.cta_id ?? `cta_${faker.string.alphanumeric({ length: 8 })}`,
        location: overrides?.location ?? faker.helpers.arrayElement(CTA_LOCATIONS),
      },
    };
  },
  signupStarted(overrides?: Partial<SignupStartedEvent['props']>): SignupStartedEvent {
    return {
      name: 'signup_started',
      props: { source: overrides?.source ?? faker.helpers.arrayElement(SIGNUP_SOURCES) },
    };
  },
  signupCompleted(overrides?: Partial<SignupCompletedEvent['props']>): SignupCompletedEvent {
    return {
      name: 'signup_completed',
      props: { method: overrides?.method ?? faker.helpers.arrayElement(SIGNUP_METHODS) },
    };
  },
  subscriptionStarted(
    overrides?: Partial<SubscriptionStartedEvent['props']>,
  ): SubscriptionStartedEvent {
    return {
      name: 'subscription_started',
      props: { plan: overrides?.plan ?? faker.helpers.arrayElement(PLAN_SLUGS) },
    };
  },
  accountDeleted(overrides?: Partial<AccountDeletedEvent['props']>): AccountDeletedEvent {
    return {
      name: 'account_deleted',
      props: { reason: overrides?.reason ?? faker.helpers.arrayElement(DELETE_REASONS) },
    };
  },
};
