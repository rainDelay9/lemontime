# lemontime

## Design

The overall design hinges on two distinct parts:

1. API - This includes a REST API Gateway, backed by two lambda functions, controlling the POST and GET routes.
1. Backend - This includes everything that is responsible for sending a POST message when a timer elapses.

The infrastructure is built with [AWS CDK](https://aws.amazon.com/cdk/) in Typescript, the actual pieces of code (4 lambdas and one script) are written in python, and a simple Dockerfile is used for Fargate.

![lemontime design diagram](assets/lemontime_design.jpeg 'Design Diagram')

### API

The API is managed by a simple AWS REST API Gateway, with a lambda function for handling each route.

1. POST route is responsible for creating new timers. POST route generates a new UUID (UUID4), and that is used to save the timer in two places in the DB:

    a. An entry indexed by the timer ID, which contains the (epoch) time to fire, and a status.
    b. An entry indexed by the time to fire which contains a map of "id -> url".

This double schema is intended to negate the need for expensive scan operations (equivalent to a SELECT \* WHERE... SQL query) when querying for elapsed timers. The purpose of negating this is twofold: It is cheaper, and it is (much) faster - pretty much constant query time no matter how many timers have been created.

### Backend

The backend is comprised of three main parts:

1. Trigger - This component, built from an AWS Fargate-backed python application, with an SSM parameter and an SQS queue (Distribution queue) is responsible for triggering url firing flow every second. It uses the SSM parameter for non-volatile storage of the latest second for which the flow was triggered (this is in case the application fails and there needs to be a firing of missed timers), where the messages sent to SQS queue are simply the current epoch second (e.g. 1651765337 for Thursday, May 5, 2022 3:42:17 PM GMT).
1. Distribution lambda - This lambda function reads the timer entry for that specific second from DB, and if it exists writes a message for each timer that is scheduled to set off in that second to Fire SQS queue.
1. Fire lambda - receives a pair of (id, url) as input from Fire queue, send a POST message to the URL, and then updates the status of timer entry with id accordingly.

## Notes, Questions, and Improvements

### Database Selection

Why NoSQL? It is true that currently we are working with a fixed schema, allowing for both SQL and Non-SQL databases, but there doesn't seem to be any need now or in the future, for and oin operations. Thus, a simple read-write storage is good enough.

Why DynamoDB? First, if you plan your schema correctly, and expect many distinct keys (which we are), DynamoDB offers incredibly fast query times, with super-high availability.

Why not DynamoDB? To be truthful, I am not sure if DynamoDB is the best choice in this case. A better choice I think is Amazon DocumentDB, which is an AWS managed version of MongoDB. The reason I think this is a better option stems from the operation executed in the POST lambda - updating a the map of URLs for a specific second. This update should happen if an entry for this specific second already exists, and an entry should be created if it does not (with the id,url pair already in the map). It is easy to see that this operation (try to update, if failed write new entry) needs to be atomic. Unfortunately, DynamoDB currently does not support this update-or-create operation in an atomic way, whereas MongoDB's findAndUpdateOne operation which (I think) can be used for this is atomic. However, selecting DocumentDB would have been a money-waster as it is managed on EC2 instances and is pretty expensive, at least for the amount of money I'm willing to spend on a home assignment.

### Inherent Problems with 1-second triggers

At a first glance it would seem that the entire fargate-backed application whose only purpose is to generate a timer for the url firing mechanism is redundant. It would be better to use, say, AWS EventBridge and trigger the distribution lambda every second. Unfortunately cron expressions for EventBridge only support a maximum of per-minute granularity. Thus, a need for per-second timers arose. But even that is not trivial to create. Lets assume we have a timer that works like this:

```python
while True:
    triggering_mechanism()
    sleep(1)
```

If the `triggering_mechanism()` function takes 0.4 seconds, then the second time we are triggering we will start 1.4 seconds after the loop was first started, the third time after 2.8 seconds, and the fourth after 4.2 seconds. It would appear as though we missed an entire second. Thus, something like the following would be more appropriate:

```python
while True:
    triggering_mechanism()
    sleep(0.2)
```

But now triggering can occur twice in the same second, and double fires will occur. Note that no matter how much time we choose to sleep, or how long the triggering mechanism takes, we will always be either below or above one second, each with its problems. It would appear as though this problem is not as trivial as would seem, and therefore has a more complex solution in code.

### Scaling

A good question to ask is "how well does this solution scale?". The answer? Very well. Usual bottlenecks for scaling are around DB access. If my DB only supports 100 writes per-second then I am going to be capped at handling 100 POST requests per-second. (or slightly less) DynamoDB can scale very well with increasing write demands. This solution also plays well with horizontal scaling.

The number of timers that can be triggered per-second in this solution is capped because of technical reasons:

1. Each DynamoDB attribute can hold no more than 400KB of data. If the average entry is about 100 bytes long, then no more than 4000 timers can go off every second.
1. Lambda function concurrency has strict quotas, of ~6000 per account (IIRC) per second. This is less of a problem, as the average post request takes much less than a second. (Except the first one because of cold starts)

Since the data held in the database is conducive to sharding, one approach can be to split it between N tables, based on the modulo N of the ID. If we assume UUID4s are distributed evenly (fair assumption), then each shard will hold ~the same amount of timers, mitigating the first problem. This solution also has its share of problems, as changing N might prove tricky. (If id=17 and N changes from 9 to 11, then the shard changes from 8 to 6) For problem 2 quotas can be increased, or sharding can be split across accounts. In the end, if we are looking at supporting a truly gigantic number of timers, perhaps serverless is not the way for us, or at least Lambda is not. (Fargate is great)

## Installation & Deployment

### Prerequisites

### Deployment

## TODO

1. checks for failure
1. delete on unsuccessful second write in post
1. add queue and write - **DONE**
1. add lambda to distribute (+ queue) - **DONE**
1. add lambda to fire url and update db status - **DONE**
1. fix DynamoDB permissions - **DONE**
1. fix SQS permissions - **DONE**
1. fix SSM permissions - **DONE**
1. implement fire time trigger - **DONE**
1. deploy to ECS - **DONE** (fargate)
1. ssm param with failsafe - **DONE**
1. Install & Deploy instructions
1. add DynamoDB table to CDK - **DONE**
1. fix missed timers
1. fix fargate lambda code to normal python - **DONE**
1. refactor cdk to look normal - **DONE**
1. take account as parameter
1. add support for (0,0,0), (0,0,1) timers
