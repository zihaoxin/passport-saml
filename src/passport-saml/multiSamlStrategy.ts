import util from 'util';
import * as saml from './saml';
import {CacheProvider as InMemoryCacheProvider} from './inmemory-cache-provider';
import SamlStrategy from './strategy';
import type { Request } from 'express';
import { AuthenticateOptions, AuthorizeOptions, SamlConfig, VerifyWithoutRequest, VerifyWithRequest } from './types';

type SamlOptionsCallback = (err: Error | null, samlOptions?: SamlConfig) => void;

interface MultiSamlConfig extends SamlConfig {
  getSamlOptions(req: Request, callback: SamlOptionsCallback): void;
}

class MultiSamlStrategy extends SamlStrategy {
  _options: MultiSamlConfig
  constructor(options: MultiSamlConfig, verify: VerifyWithRequest | VerifyWithoutRequest) {
    if (!options || typeof options.getSamlOptions != 'function') {
      throw new Error('Please provide a getSamlOptions function');
    }

    if(!options.requestIdExpirationPeriodMs){
      options.requestIdExpirationPeriodMs = 28800000;  // 8 hours
    }

    if(!options.cacheProvider){
        options.cacheProvider = new InMemoryCacheProvider(
            {keyExpirationPeriodMs: options.requestIdExpirationPeriodMs });
    }

    super(options, verify);
    this._options = options;
  }

  authenticate(req: Request, options: AuthenticateOptions & AuthorizeOptions) {
    this._options.getSamlOptions(req, (err, samlOptions) => {
      if (err) {
        return this.error(err);
      }

      const samlService = new saml.SAML(Object.assign({}, this._options, samlOptions));
      const strategy = Object.assign({}, this, {_saml: samlService});
      Object.setPrototypeOf(strategy, this);
      super.authenticate.call(strategy, req, options);
    });
  }

  logout(req: Request, callback: (err: Error | null, url?: string | undefined) => void) {
    this._options.getSamlOptions(req, (err, samlOptions) => {
      if (err) {
        return callback(err);
      }

      const samlService = new saml.SAML(Object.assign({}, this._options, samlOptions));
      const strategy = Object.assign({}, this, {_saml: samlService});
      Object.setPrototypeOf(strategy, this);
      super.logout.call(strategy, req, callback);
    });
  }

  // @ts-expect-error typescript disallows changing method signature in a subclass
  generateServiceProviderMetadata(
    req: Request,
    decryptionCert: string | null,
    signingCert: string | null,
    callback: (err: Error | null, metadata?: string) => void
  ) {
    if (typeof callback !== 'function') {
      throw new Error("Metadata can't be provided synchronously for MultiSamlStrategy.");
    }

    return this._options.getSamlOptions(req, (err, samlOptions) => {
      if (err) {
        return callback(err);
      }

      const samlService = new saml.SAML(Object.assign({}, this._options, samlOptions));
      const strategy = Object.assign({}, this, {_saml: samlService});
      Object.setPrototypeOf(strategy, this);
      return callback(null, super.generateServiceProviderMetadata.call(strategy, decryptionCert, signingCert));
    });
  }
}

export = MultiSamlStrategy;