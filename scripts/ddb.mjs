/**
 * DIRECT TABLE ACCESS for the scripts whose job is production housekeeping —
 * make-leader, ensure-test-accounts, production-reset, repair-push-prefs.
 *
 * They used to sign in as a seeded leadership user and go through AppSync.
 * That only worked because the seeded people lived in production, and the
 * October 2026 clean-up removed them. These scripts run with the deployer's AWS
 * credentials instead, which is also the more honest shape of "done from
 * outside the app".
 *
 * Amplify names each model's table `<Model>-<appsyncApiId>-NONE`. The api id
 * is not in amplify_outputs.json, so it is looked up by matching the GraphQL
 * endpoint the outputs file does contain.
 *
 *   const db = await tables(outputs);
 *   await db.scan('Profile');
 *   await db.create('Profile', { owner, email, … });   // adds id, __typename, createdAt, updatedAt
 *   await db.patch('PushToken', id, { wantsNotes: true }, ['profileId']);  // set, then remove
 *   await db.remove('Note', id);
 */
import { AppSyncClient, ListGraphqlApisCommand } from '@aws-sdk/client-appsync';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

export async function tables(outputs) {
  const region = outputs.data.aws_region;
  const appsync = new AppSyncClient({ region });
  let apiId = null;
  let nextToken;
  do {
    const r = await appsync.send(new ListGraphqlApisCommand({ nextToken }));
    const hit = r.graphqlApis.find((a) => a.uris?.GRAPHQL === outputs.data.url);
    if (hit) apiId = hit.apiId;
    nextToken = r.nextToken;
  } while (!apiId && nextToken);
  if (!apiId) throw new Error(`No AppSync API serves ${outputs.data.url} in ${region}`);

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const name = (model) => `${model}-${apiId}-NONE`;

  async function scan(model) {
    const items = [];
    let ExclusiveStartKey;
    do {
      const r = await doc.send(new ScanCommand({ TableName: name(model), ExclusiveStartKey }));
      items.push(...(r.Items ?? []));
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  /** Writes a row the way Amplify would: id, __typename and both timestamps. */
  async function create(model, fields) {
    const now = new Date().toISOString();
    const item = { id: randomUUID(), __typename: model, createdAt: now, updatedAt: now, ...fields };
    await doc.send(new PutCommand({ TableName: name(model), Item: item }));
    return item;
  }

  async function remove(model, id) {
    await doc.send(new DeleteCommand({ TableName: name(model), Key: { id } }));
  }

  /** Sets the given fields (and updatedAt), and removes the `unset` ones. */
  async function patch(model, id, set, unset = []) {
    const fields = { ...set, updatedAt: new Date().toISOString() };
    const names = {}, values = {};
    const sets = Object.entries(fields).map(([k, v], i) => {
      names[`#s${i}`] = k; values[`:s${i}`] = v; return `#s${i} = :s${i}`;
    });
    const removes = unset.map((k, i) => { names[`#r${i}`] = k; return `#r${i}`; });
    const expr = `SET ${sets.join(', ')}${removes.length ? ` REMOVE ${removes.join(', ')}` : ''}`;
    await doc.send(new UpdateCommand({
      TableName: name(model), Key: { id },
      UpdateExpression: expr, ExpressionAttributeNames: names, ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(id)',
    }));
  }

  return { apiId, name, scan, create, remove, patch };
}
