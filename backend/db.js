import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined, // Used for local testing
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "FamilyTreeTable";

export const db = {
  async put(item) {
    return docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  },
  async get(pk, sk) {
    return docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }));
  },
  async query(pk, prefix) {
    return docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
    }));
  },
  async delete(pk, sk) {
    return docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } }));
  },
  async updatePosition(id, x, y) {
    return docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: "MEMBERS", SK: `MEMBER#${id}` },
      UpdateExpression: "SET x = :x, y = :y",
      ExpressionAttributeValues: { ":x": x, ":y": y },
    }));
  }
};
