#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'monocdk';
import { Creator } from '../lib/creator';

const app = new App();

new Creator(app);
