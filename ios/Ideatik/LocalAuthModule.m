#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LocalAuthModule, NSObject)

RCT_EXTERN_METHOD(isDeviceSecure:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(authenticate:(NSString *)title
                  description:(NSString *)description
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
