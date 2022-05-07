import { App } from 'monocdk';
import { LemonTimeStack } from '../lib/lemontime-stack';

export class Creator {
    constructor(app: App) {
        const account = app.node.tryGetContext('account');
        if (!account) {
            throw new Error(
                'Account does not appear in context; Please deploy with "--context account=<your-account>"'
            );
        }
        new LemonTimeStack(app, 'LemonTimeStack', {
            env: {
                account: account,
                region: 'us-east-1',
            },
        });
    }
}
