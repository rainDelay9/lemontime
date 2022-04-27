import uuid
import boto3
import json
import time
import os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DDB_TABLE_NAME'])

def respond(res):
    return {
        'statusCode': '200',
        'body': json.dumps(res),
        'headers': {
            'Content-Type': 'application/json',
        },
    }

def handler(event, context):
    body = json.loads(event['body'])
    trigger_time = int(time.time() + body['hours']*3600 + body['minutes']*60 + body['seconds'])
    trigger_id = str(uuid.uuid4())
    entry = {
        'id': trigger_id,
        'time': trigger_time,
        'url': body['url'],
    }
    table.put_item(
        Item=entry
    )
    return respond({"id": trigger_id})