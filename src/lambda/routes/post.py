import uuid
#import boto3

def handler(event, context):
    print(event)
    return {
        "isBase64Encoded": "false",
        "statusCode": 200,
        "headers": { },
        "body": "This is an example body"
    }