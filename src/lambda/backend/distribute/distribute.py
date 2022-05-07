import boto3
import json
import os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DDB_TABLE_NAME'])
sqs_client = boto3.client('sqs')
queue_url = os.environ['FIRE_QUEUE_URL']

def send_url_to_queue(id, url):
    res = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps({'id': id, 'url': url})
    )
    res

def respond(code, res):
    return {
        'statusCode': code,
        'body': json.dumps(res),
        'headers': {
            'Content-Type': 'application/json',
        },
    }

def handler(event, context):
    records = event['Records']
    for record in records:
        trigger = int(record['body'])
        try:
            response = table.get_item(
                Key={
                    'id': 'T#{}'.format(trigger),
                },
                ProjectionExpression ='timers',
            )
            if 'Item' in response: #timers exist for this second
                timers = response['Item']['timers']
                for key in timers:
                    send_url_to_queue(key, timers[key])

                try: #update timers to TAKEN
                    table.update_item(
                        Key={
                            'id': 'T#{}'.format(trigger)
                        },
                        UpdateExpression="SET #atr = :s",
                        ExpressionAttributeNames = { "#atr" : 'status' },
                        ExpressionAttributeValues={
                            ':s': 'TAKEN'
                        }
                    )
                except Exception as e:
                    print(e)
                    print('Could not update item {} to TAKEN'.format(trigger))
        except Exception as e:
            print(e)
            print('Could not get item {}'.format(trigger))

    return respond(200, {"status": "success"})