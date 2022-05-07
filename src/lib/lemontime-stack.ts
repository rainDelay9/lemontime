import { Stack, StackProps, Construct } from 'monocdk';
import * as apigw from 'monocdk/aws-apigateway';
import * as lambda from 'monocdk/aws-lambda';
import * as les from 'monocdk/aws-lambda-event-sources';
import * as iam from 'monocdk/aws-iam';
import * as sqs from 'monocdk/aws-sqs';
import * as ssm from 'monocdk/aws-ssm';
import * as ecs from 'monocdk/aws-ecs';
import * as ec2 from 'monocdk/aws-ec2';
import * as dynamodb from 'monocdk/aws-dynamodb';
import * as path from 'path';

export class LemonTimeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        ///////////////////////////////////////////
        //////////////// Database /////////////////
        ///////////////////////////////////////////

        const table = new dynamodb.Table(this, 'LemonTime-Table', {
            tableName: 'timers',
            partitionKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING,
            },
        });

        ///////////////////////////////////////////
        ////////////////// API ////////////////////
        ///////////////////////////////////////////

        // ROUTES

        // POST /timers

        const postTimersBackendLambda = new lambda.Function(
            this,
            'post-timers-function',
            {
                runtime: lambda.Runtime.PYTHON_3_9,
                handler: 'post.handler',
                code: lambda.Code.fromAsset(
                    path.join(__dirname, '../lambda/routes/timers/post')
                ),
                environment: {
                    DDB_TABLE_NAME: table.tableName,
                },
            }
        );

        table.grantReadWriteData(postTimersBackendLambda);

        // GET /timers/{:id}

        const getTimersBackendLambda = new lambda.Function(
            this,
            'get-timers-function',
            {
                runtime: lambda.Runtime.PYTHON_3_9,
                handler: 'get.handler',
                code: lambda.Code.fromAsset(
                    path.join(__dirname, '../lambda/routes/timers/get')
                ),
                environment: {
                    DDB_TABLE_NAME: table.tableName,
                },
            }
        );

        table.grantReadData(getTimersBackendLambda);

        // API GATEWAY

        const api = new apigw.RestApi(this, 'api-gateway', {
            deployOptions: {
                dataTraceEnabled: true,
                tracingEnabled: true,
            },
            endpointConfiguration: {
                types: [apigw.EndpointType.REGIONAL],
            },
        });

        // POST /timers body model

        const newTimerModel = api.addModel('NewTimerModel', {
            schema: {
                type: apigw.JsonSchemaType.OBJECT,
                properties: {
                    hours: {
                        type: apigw.JsonSchemaType.INTEGER,
                    },
                    minutes: {
                        type: apigw.JsonSchemaType.INTEGER,
                    },
                    seconds: {
                        type: apigw.JsonSchemaType.INTEGER,
                    },
                    url: {
                        type: apigw.JsonSchemaType.STRING,
                    },
                },
                required: ['hours', 'minutes', 'seconds', 'url'],
            },
        });

        const timers = api.root.addResource('timers');
        timers.addMethod(
            'POST',
            new apigw.LambdaIntegration(postTimersBackendLambda, {
                passthroughBehavior: apigw.PassthroughBehavior.NEVER,
            }),
            {
                requestModels: {
                    $default: newTimerModel,
                },
                requestValidator: new apigw.RequestValidator(
                    this,
                    'post-request-validator',
                    {
                        requestValidatorName: newTimerModel.modelId,
                        restApi: api,
                        validateRequestBody: true,
                    }
                ),
            }
        );

        const getResource = timers.addResource('{id}');
        getResource.addMethod(
            'GET',
            new apigw.LambdaIntegration(getTimersBackendLambda, {})
        );

        const deployment = new apigw.Deployment(this, 'Deployment', {
            api,
        });

        ///////////////////////////////////////////
        //////////////// BACKEND //////////////////
        ///////////////////////////////////////////

        const secondsSinceEpoch = Math.round(Date.now() / 1000 + 180); // this is 3 minutes from now for a new deploy
        const parameter = new ssm.StringParameter(
            this,
            'Latest-Time-Triggered-Parameter',
            {
                stringValue: secondsSinceEpoch.toString(),
                parameterName: '/lemontime/trigger/latest',
                type: ssm.ParameterType.STRING,
            }
        );

        const distributionQueue = new sqs.Queue(
            this,
            'LemonTime-Distribution-Queue',
            {
                queueName: 'LemonTime-Distribution-Queue',
            }
        );

        const fireQueue = new sqs.Queue(this, 'LemonTime-Fire-Queue', {
            queueName: 'LemonTime-Fire-Queue',
        });

        // Trigger

        const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
            isDefault: true,
        });

        const cluster = new ecs.Cluster(this, 'Trigger-Cluster', {
            vpc,
        });

        const taskDefinition = new ecs.FargateTaskDefinition(
            this,
            'Trigger-Task-Definition',
            {}
        );

        taskDefinition.addContainer('Trigger-Container', {
            image: ecs.ContainerImage.fromAsset(
                path.join(__dirname, '../docker/trigger')
            ),
            memoryLimitMiB: 500,
            logging: new ecs.AwsLogDriver({
                streamPrefix: '/lemontime/trigger',
                mode: ecs.AwsLogDriverMode.NON_BLOCKING,
            }),
        });

        parameter.grantRead(taskDefinition.taskRole);
        parameter.grantWrite(taskDefinition.taskRole);

        distributionQueue.grantSendMessages(taskDefinition.taskRole);

        const triggerService = new ecs.FargateService(this, 'Trigger-service', {
            taskDefinition,
            cluster,
            assignPublicIp: true,
        });

        // Distribute

        const distributeLambda = new lambda.Function(
            this,
            'distribute-function',
            {
                runtime: lambda.Runtime.PYTHON_3_9,
                handler: 'distribute.handler',
                code: lambda.Code.fromAsset(
                    path.join(__dirname, '../lambda/backend/distribute')
                ),
                environment: {
                    DDB_TABLE_NAME: table.tableName,
                    FIRE_QUEUE_URL: fireQueue.queueUrl,
                },
            }
        );

        table.grantReadData(distributeLambda);

        const distributeEventSource = new les.SqsEventSource(distributionQueue);

        distributeLambda.addEventSource(distributeEventSource);

        fireQueue.grantSendMessages(distributeLambda);

        // Fire

        const fireLambda = new lambda.Function(this, 'fire-function', {
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'fire.handler',
            code: lambda.Code.fromAsset(
                path.join(__dirname, '../lambda/backend/fire')
            ),
            environment: {
                DDB_TABLE_NAME: table.tableName,
            },
        });

        table.grantReadWriteData(fireLambda);

        const fireEventSource = new les.SqsEventSource(fireQueue);

        fireLambda.addEventSource(fireEventSource);
    }
}
