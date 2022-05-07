import uuid
import boto3
import botocore
import json
import time
import os
from botocore.exceptions import ClientError
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

def compute_trigger_time(now, hours, minutes, seconds):
    return int(now + hours * 3600 + minutes * 60 + seconds)

def gen_catalog_entry(trigger_id, trigger_time):
    return {
        'id': 'E#{}'.format(trigger_id),
        'time': trigger_time,
        'status': 'ACTIVE'
    }

def validate(body):
    return body['hours'] >= 0 and body['minutes'] >= 0 and body['seconds'] >= 0

def handler(event, context):
    body = json.loads(event['body'])
    trigger_id = str(uuid.uuid4())
    if not validate(body):
        return respond(500, {"reason": "Illegal parameters"})

    trigger_time = compute_trigger_time(time.time(), body['hours'], body['minutes'], body['seconds'])
    catalog_entry = gen_catalog_entry(trigger_id, trigger_time)

    try:
        table.put_item(Item=catalog_entry)
    except:
        return respond(500, {"reason": "Server Error"})

    try:
        table.update_item(
            Key={
                'id': 'T#{}'.format(trigger_time)
            },
            UpdateExpression="SET timers.#id = :url",
            ExpressionAttributeNames = { "#id" : trigger_id },
            ExpressionAttributeValues={
                ':url': body['url']
            }
        )
    except ClientError as e:
        print(e)
         #create
        timer_entry = {
            'id': 'T#{}'.format(trigger_time),
            'status': 'PENDING',
            'timers': {
                trigger_id: body['url']
            },
        }
        try:
            table.put_item(Item=timer_entry)
        except Exception as e:
            print(e)
            return respond(500, {"reason": "Server Error"})
    except Exception as e: #Some other exception occured
        print(e)
        return respond(500, {"reason": "Server Error"})
    
    return respond(200 ,{"id": trigger_id})