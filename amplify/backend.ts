import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data, memberApi } from './data/resource';

/**
 * Finding Something Real — AWS backend.
 *
 * Cognito (email + password for now) + AppSync + DynamoDB.
 * Cost at 21 users is a few dollars a month: DynamoDB on-demand, Lambda well
 * inside the free tier, Cognito free under 50k MAU.
 *
 * The authorization design is documented in docs/AWS-AUTHZ-DESIGN.md — read it
 * before touching amplify/data/resource.ts.
 */
export const backend = defineBackend({ auth, data, memberApi });
