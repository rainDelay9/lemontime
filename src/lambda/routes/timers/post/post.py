import uuid
import boto3
import json
import time
import os

sqs_client = boto3.client('sqs')
queue_url = os.environ['INCOMING_MESSAGES_QUEUE_URL']

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
    sqs_client.send_message(QueueUrl=queue_url, MessageBody=json.dumps({"id": trigger_id, "trigger": trigger_time, "url": body['url']}))
    return respond({"id": trigger_id})