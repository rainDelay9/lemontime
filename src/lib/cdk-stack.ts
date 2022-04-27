import { Stack, StackProps, Construct } from 'monocdk';
import * as apigw from 'monocdk/aws-apigateway';
import * as lambda from 'monocdk/aws-lambda';
import * as iam from 'monocdk/aws-iam';
import * as path from 'path';

export class LemonTimeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

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
    }
}
