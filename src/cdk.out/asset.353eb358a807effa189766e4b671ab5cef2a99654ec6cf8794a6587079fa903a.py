import uuid
#import boto3

def handler(event, context):
    operation = event['operation']
    print(operation)
    return { 
        'statusCode': 200,
        'body': 'SUCCESS'
        }