#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SystemNotification, NSObject)

RCT_EXTERN_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(notify:(NSString *)title
                  body:(NSString *)body
                  noteId:(NSString *)noteId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
