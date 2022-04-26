import { Stack, StackProps, Construct } from 'monocdk';
import * as apigw from 'monocdk/aws-apigateway';
import * as lambda from 'monocdk/aws-lambda';
import * as path from 'path';

export class LemonTimeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // The code that defines your stack goes here

        // example resource
        // const queue = new sqs.Queue(this, 'CdkQueue', {
        //   visibilityTimeout: cdk.Duration.seconds(300)
        // });

        // ROUTES

        // POST /timers

        const postTimersBackend = new lambda.Function(
            this,
            'post-timers-function',
            {
                runtime: lambda.Runtime.PYTHON_3_9,
                handler: 'post.handler',
                code: lambda.Code.fromAsset(
                    path.join(__dirname, '../lambda/routes/timers/post')
                ),
            }
        );

        // GET /timers/{:id}

        const getTimersBackend = new lambda.Function(
            this,
            'get-timers-function',
            {
                runtime: lambda.Runtime.PYTHON_3_9,
                handler: 'get.handler',
                code: lambda.Code.fromAsset(
                    path.join(__dirname, '../lambda/routes/timers/get')
                ),
            }
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

        /*   const userModel: apigateway.Model = api.addModel('UserModel', {
         *         schema: {
         *             type: apigateway.JsonSchemaType.OBJECT,
         *             properties: {
         *                 userId: {
         *                     type: apigateway.JsonSchemaType.STRING
         *                 },
         *                 name: {
         *                     type: apigateway.JsonSchemaType.STRING
         *                 }
         *             },
         *             required: ['userId']
         *         }
         *     });
         *     api.root.addResource('user').addMethod('POST',
         *         new apigateway.LambdaIntegration(userLambda), {
         *             requestModels: {
         *                 'application/json': userModel
         *             }
         *         }
         *     );
         * */

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
            new apigw.LambdaIntegration(postTimersBackend, {
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

        timers.addMethod(
            'GET',
            new apigw.LambdaIntegration(getTimersBackend, {})
        );

        const deployment = new apigw.Deployment(this, 'Deployment', {
            api,
        });
    }
}
