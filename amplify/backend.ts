import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data, memberApi, youtubeSync } from './data/resource';

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
export const backend = defineBackend({ auth, data, memberApi, youtubeSync });

/**
 * The user pool id, under a name we choose.
 *
 * The `access` grant in auth/resource.ts also injects one, but its name is
 * derived from Amplify's internal resource name rather than documented, and
 * the generated env types are only refreshed on deploy — so reading that one
 * typechecks against a stale file and fails at runtime. Passing it explicitly
 * removes the guess.
 */
backend.memberApi.addEnvironment(
  'FSR_USER_POOL_ID',
  backend.auth.resources.userPool.userPoolId,
);

/**
 * Let member-api delete a Cognito user, and nothing else.
 *
 * One action, one resource. Not createUser, not setUserPassword, not
 * addUserToGroup — a function that could do those could promote someone into
 * the leadership group.
 *
 * Attached here rather than through defineAuth's `access` callback: that
 * callback makes the auth stack depend on the function's stack, and because
 * data already depends on auth, CloudFormation rejected the whole deployment
 * as a circular dependency. A policy added from the backend points one way.
 */
backend.memberApi.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:AdminDeleteUser'],
    resources: [backend.auth.resources.userPool.userPoolArn],
  }),
);
