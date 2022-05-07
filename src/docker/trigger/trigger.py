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


def run():
    # catch up to latest (if latest > now) - This can happen one new stack deploy
    latest = get_latest_time()
    while latest > int(time.time()):
        time.sleep(0.5)

    # catch up to now (if latest < now) - This can happen after failure
    latest = get_latest_time()
    while True:
        now = int(time.time())
        if latest == now:
            print('catch up - updating latest when done: {}'.format(now))
            update_latest(now)
            break

        latest = get_latest_time()
        for t in range(latest+1, now+1):
            print('catch up - sending message: {}'.format(t))
            send_message(t)
            latest = t
            

    # increment seconds
    latest = get_latest_time()
    while True:
        now = int(time.time())
        if now > latest:
            # this is a loop in case some AWS calls have taken too long and we need to catch up
            for t in range(latest + 1, now + 1): 
                print('incremental - sending message: {}'.format(now))
                send_message(now)
                latest = now
                print('incremental - updating latest: {}'.format(now))
                update_latest(now)
        time.sleep(0.2)

if __name__ == "__main__":
    while True:
        try:
            run()
        except Exception as e:
            print(e)

