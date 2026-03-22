#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <TargetConditionals.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"RecipeJar";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  // Simulator: Metro on localhost. Physical iPhone: must use your Mac's LAN IP or RN falls back to a
  // stale embedded bundle — UI never updates while API (api.ts) still hits the right host.
#if TARGET_OS_SIMULATOR
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  {
    NSString *host = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"RecipeJarDevPackagerHost"];
    if ([host isKindOfClass:[NSString class]] && host.length > 0) {
      return [RCTBundleURLProvider jsBundleURLForBundleRoot:@"index"
                                               packagerHost:host
                                             packagerScheme:@"http"
                                                  enableDev:YES
                                         enableMinification:NO
                                            inlineSourceMap:NO
                                                modulesOnly:NO
                                                  runModule:YES];
    }
    return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
  }
#endif
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
