import uuid
#import boto3
import json

def respond(res):
    return {
        'statusCode': '200',
        'body': json.dumps(res),
        'headers': {
            'Content-Type': 'application/json',
        },
    }

def handler(event, context):
    print(event)
    return respond("Hello from get")