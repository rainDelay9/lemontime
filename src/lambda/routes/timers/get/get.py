import boto3
import json
import os
import time
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DDB_TABLE_NAME'])

def respond(code, res):
    return {
        'statusCode': code,
        'body': json.dumps(res),
        'headers': {
            'Content-Type': 'application/json',
        },
    }

def handler(event, context):
    id = event['pathParameters']['id']
    try:
        item = table.get_item(
            Key={
                'id': 'E#{}'.format(id),
            }
        )
    except:
        return respond(500, {'reason': 'Server Error'})

    trigger = int(item['Item']['time'])
    now = int(time.time())
    status = item['Item']['status']
    return respond(200, {'id': id, 'status': status, 'time_left': max(trigger - now, 0)})