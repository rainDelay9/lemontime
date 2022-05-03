import time

latest_time = 0
for i in range(0,40):
    now = int(time.time())
    if now != latest_time:
        print(now)
        latest_time = now
    time.sleep(0.2)


