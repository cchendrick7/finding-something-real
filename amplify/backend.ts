import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import {
  data, memberApi, youtubeSync, adminApi, pushApi, publicApi, pushOutbox,
} from './data/resource';

/**
 * Finding Something Real — AWS backend.
 *
 * Cognito (email + password) + AppSync + DynamoDB, plus six functions:
 *
 *   member-api    everything a co-host can read or do — THE PRIVACY BOUNDARY
 *   admin-api     leadership's account and session actions
 *   push-api      device registration and notification preferences
 *   push-outbox   sends what is due, every five minutes
 *   public-api    the interest form, the one anonymous write
 *   youtube-sync  keeps PublicEpisode in step with the channel, every two hours
 *
 * Cost at this size is a few dollars a month: DynamoDB on-demand, Lambda well
 * inside the free tier, Cognito free under 50k MAU.
 *
 * Two deployments of this same code — production (sandbox identifier `root`)
 * and test (`fsrtest`). See scripts/target.mjs.
 *
 * The authorization design is documented in docs/AWS-AUTHZ-DESIGN.md — read it
 * before touching amplify/data/resource.ts.
 */
export const backend = defineBackend({
  auth, data, memberApi, youtubeSync, adminApi, pushApi, publicApi, pushOutbox,
});

const userPool = backend.auth.resources.userPool;

/**
 * The user pool id, under a name we choose.
 *
 * The `access` grant in auth/resource.ts would also inject one, but its name
 * is derived from Amplify's internal resource name rather than documented, and
 * the generated env types are only refreshed on deploy — so reading that one
 * typechecks against a stale file and fails at runtime. Passing it explicitly
 * removes the guess.
 */
backend.memberApi.addEnvironment('FSR_USER_POOL_ID', userPool.userPoolId);
backend.adminApi.addEnvironment('FSR_USER_POOL_ID', userPool.userPoolId);

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
    resources: [userPool.userPoolArn],
  }),
);

/**
 * admin-api gets exactly the powers provisioning needs — and IAM cannot narrow
 * AdminAddUserToGroup to the `cohost` group (there is no condition key for the
 * group name). That rule lives in the handler, as a constant, and
 * scripts/admin-test.mjs is what enforces it.
 */
backend.adminApi.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminCreateUser',
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:AdminSetUserPassword',
      'cognito-idp:AdminDisableUser',
      'cognito-idp:AdminEnableUser',
      'cognito-idp:AdminListGroupsForUser',
      'cognito-idp:ListUsers',
    ],
    resources: [userPool.userPoolArn],
  }),
);

/**
 * No self-registration. defineAuth's default lets anyone create an account in
 * the pool by calling Cognito directly. Nobody did, and it granted nothing —
 * but the app tells co-hosts in writing that there is no public sign-up, so it
 * is now literally true. Accounts come from provisionCohost or make-leader.
 */
const { cfnUserPool, cfnUserPoolClient } = backend.auth.resources.cfnResources;
cfnUserPool.adminCreateUserConfig = {
  ...(cfnUserPool.adminCreateUserConfig as object),
  allowAdminCreateUserOnly: true,
};

/**
 * The `email` schema attribute is left OUT of the template, on purpose.
 *
 * Cognito refuses any change to an existing pool's schema attributes ("Existing
 * schema attributes cannot be modified or deleted"), and what Amplify generates
 * for `email` does not match what the production pool was created with in
 * August. Any edit that makes CloudFormation update the pool — turning off
 * self-registration was the first, 16 Sep — then fails on Schema, whatever was
 * actually being changed. Omitting it lets the pool be updated; the attribute
 * itself is untouched because a pool's schema cannot change anyway.
 */
cfnUserPool.addPropertyDeletionOverride('Schema');

/**
 * TEST BACKEND ONLY: the suites sign in with ADMIN_USER_PASSWORD_AUTH (no SRP
 * round trip). Production's client has that flow too, but only because it was
 * added by hand on 17 Aug — drift, recorded rather than repeated here — and the
 * app itself uses SRP everywhere.
 */
if (backend.stack.node.tryGetContext('amplify-backend-name') === 'fsrtest') {
  cfnUserPoolClient.explicitAuthFlows = [
    'ALLOW_ADMIN_USER_PASSWORD_AUTH',
    'ALLOW_CUSTOM_AUTH',
    'ALLOW_REFRESH_TOKEN_AUTH',
    'ALLOW_USER_SRP_AUTH',
  ];
}
