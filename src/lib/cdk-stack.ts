import { Stack, StackProps, Construct } from 'monocdk';
import * as apigw from 'monocdk/aws-apigateway';
import * as lambda from 'monocdk/aws-lambda';
import * as iam from 'monocdk/aws-iam';
import * as sqs from 'monocdk/aws-sqs';
import * as ssm from 'monocdk/aws-ssm';
import * as ecs from 'monocdk/aws-ecs';
import * as asg from 'monocdk/aws-autoscaling';
import * as ec2 from 'monocdk/aws-ec2';
import * as path from 'path';

export class LemonTimeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

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
                    DDB_TABLE_NAME: 'test_table',
                },
            }
        );

        postTimersBackendLambda.role?.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                'AmazonDynamoDBFullAccess'
            )
        );

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
                    DDB_TABLE_NAME: 'test_table',
                },
            }
        );

        getTimersBackendLambda.role?.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                'AmazonDynamoDBFullAccess'
            )
        );

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

        const secondsSinceEpoch = Math.round(Date.now() / 1000);
        const parameter = new ssm.StringParameter(
            this,
            'Latest-Time-Triggered-Parameter',
            {
                stringValue: secondsSinceEpoch.toString(),
                parameterName: 'lemontime/trigger/latest',
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

        const cluster = new ecs.Cluster(this, 'Trigger-Cluster');

        const autoScalingGroup = new asg.AutoScalingGroup(this, 'ASG', {
            vpc,
            instanceType: new ec2.InstanceType('t2.micro'),
            machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
            minCapacity: 1,
            maxCapacity: 1,
        });

        const capacityProvider = new ecs.AsgCapacityProvider(
            this,
            'AsgCapacityProvider',
            {
                autoScalingGroup,
            }
        );

        cluster.addAsgCapacityProvider(capacityProvider);

        const taskDefinition = new ecs.Ec2TaskDefinition(
            this,
            'Trigger-Task-Definition'
        );

        taskDefinition.addContainer('Trigger-Container', {
            image: ecs.ContainerImage.fromAsset(
                path.join(__dirname, '../docker/collector')
            ),
        });

        taskDefinition.taskRole?.addManagedPolicy(
            iam.ManagedPolicy.fromManagedPolicyArn(
                this,
                'SSM-Managed-Policy',
                'arn:aws:iam::aws:policy/AmazonSSMFullAccess'
            )
        );

        taskDefinition.taskRole?.addManagedPolicy(
            iam.ManagedPolicy.fromManagedPolicyArn(
                this,
                'SQS-Managed-Policy',
                'arn:aws:iam::aws:policy/AmazonSQSFullAccess'
            )
        );

        const triggerService = new ecs.Ec2Service(this, 'TriggerService', {
            cluster,
            taskDefinition,
        });
    }
}
