import boto3
import json
import os
import urllib3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DDB_TABLE_NAME'])
http = urllib3.PoolManager()

def respond(code, res):
    return {
        'statusCode': code,
        'body': json.dumps(res),
        'headers': {
            'Content-Type': 'application/json',
        },
    }

def handler(event, context):
    print(event)
    records = event['Records']
    for record in records:
        data = json.loads(record['body'])
        res = http.request('POST', data['url'], headers={}, body={})
        print(res.read())
        #try:
        response = table.update_item(
            Key={
                'id': 'E#{}'.format(data['id'])
            },
            UpdateExpression='SET #atr = :s',
            ExpressionAttributeValues={
                ':s': 'SUCCESS'
            },
            ExpressionAttributeNames={
                '#atr': 'status'
            }
        )
        #except:
        #    print('Could not update item status (id: {})'.format(data['id']))
    return respond(200, {"status": "success"})