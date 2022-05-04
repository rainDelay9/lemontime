import time
import boto3

parameter_name = '/lemontime/trigger/latest'
distribution_queue = 'LemonTime-Distribution-Queue'
region = 'us-east-1'
account = '097585043572'

ssm_client = boto3.client('ssm', region_name=region)
sqs_client = boto3.client('sqs', region_name=region)

queue_url = sqs_client.get_queue_url(
    QueueName=distribution_queue,
    QueueOwnerAWSAccountId=account,
)['QueueUrl']

# recap everything until now
def get_latest_time():
    res = ssm_client.get_parameter(Name=parameter_name)
    return int(res['Parameter']['Value'])

def send_message(t):
    res = sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=str(t),
    )
    return res

def update_latest(t):
    res = ssm_client.put_parameter(
        Name=parameter_name,
        Value=str(t),
        Overwrite=True
    )
    return res


while True:
    latest = get_latest_time()
    print('latest: {}'.format(latest))
    now = int(time.time())
    print('now: {}'.format(now))
    if latest == now:
        break
    for t in range(latest, now):
        print('sending message: {}'.format(t))
        send_message(t)
        print('updating latest: {}'.format(t))
        update_latest(t)

latest_time = get_latest_time()
print('latest: {}'.format(latest_time))
while True:
    now = int(time.time())
    print('now: {}'.format(now))
    if now != latest_time:
        print('sending message: {}'.format(now))
        send_message(now)
        latest_time = now
        print('updating latest: {}'.format(now))
        update_latest(now)
    time.sleep(0.2)


