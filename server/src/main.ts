import { LoggingInterceptor, MyLogger } from '@config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readFileSync } from 'fs';
import { join } from 'path';
import { xssProtection, xframe } from 'lusca';
import { useContainer } from 'class-validator';
import * as chalk from 'chalk';
import * as compression from 'compression';
import * as helmet from 'helmet';
import * as bodyParser from 'body-parser';
import * as rateLimit from 'express-rate-limit';
import {
  DOMAIN,
  END_POINT,
  NODE_ENV,
  PORT,
  PRIMARY_COLOR,
  RATE_LIMIT_MAX,
  CLIENT_HOST,
} from '@environments';

declare const module: any;

async function bootstrap() {
  try {
    let app;

    if (NODE_ENV === 'production') {
      const httpsOptions = {
        key: readFileSync(join(__dirname, '../ssl/', 'key.pem')),
        cert: readFileSync(join(__dirname, '../ssl/', 'cert.pem')),
      };

      app = await NestFactory.create(AppModule, {
        bufferLogs: true,
        httpsOptions,
      });
    } else {
      app = await NestFactory.create(AppModule, {
        bufferLogs: true,
      });
    }

    useContainer(app.select(AppModule), { fallbackOnErrors: true });

    // Logger
    app.useLogger(new MyLogger());

    // adapter for e2e testing
    app.getHttpAdapter();

    // compression
    app.use(compression());

    // added security
    app.use(helmet());
    app.enableCors({
      origin: CLIENT_HOST,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });
    app.use(xframe('SAMEORIGIN'));
    app.use(xssProtection(true));

    // body parser
    app.use(bodyParser.json({ limit: '50mb' }));
    app.use(
      bodyParser.urlencoded({
        limit: '50mb',
        extended: true,
        parameterLimit: 50000,
      }),
    );

    // rateLimit
    app.use(
      rateLimit({
        windowMs: 1000 * 60 * 60, // an hour
        max: RATE_LIMIT_MAX, // limit each IP to 100 requests per windowMs
        message:
          '⚠️  Too many request created from this IP, please try again after an hour',
      }),
    );

    //  global nest setup
    app.useGlobalPipes(new ValidationPipe());
    //app.useGlobalInterceptors(new LoggingInterceptor());

    app.enableShutdownHooks();

    await app.listen(PORT);
    if (module.hot) {
      module.hot.accept();
      module.hot.dispose(() => app.close());
    }

    NODE_ENV !== 'production'
      ? (Logger.log(
          `🤬  Application is running on: ${await app.getUrl()}`,
          'NestJS',
          false,
        ),
        Logger.log(
          `🚀  Server ready at http://${DOMAIN}:${chalk
            .hex(PRIMARY_COLOR)
            .bold(PORT.toString())}/${END_POINT}`,
          'Bootstrap',
          false,
        ),
        Logger.log(
          `🚀  Subscriptions ready at ws://${DOMAIN}:${chalk
            .hex(PRIMARY_COLOR)
            .bold(PORT.toString())}/${END_POINT}`,
          'Bootstrap',
          false,
        ))
      : Logger.log(
          `🚀  Server is listening on port ${chalk
            .hex(PRIMARY_COLOR)
            .bold(PORT.toString())}`,
          'Bootstrap',
          false,
        );
  } catch (error) {
    Logger.error(`❌  Error starting server, ${error}`, '', 'Bootstrap', false);
    process.exit();
  }
}
bootstrap().catch((e) => {
  Logger.error(`❌  Error starting server, ${e}`, '', 'Bootstrap', false);
  throw e;
});
