package flash.net.drm {
  import flash.events.EventDispatcher;
  import Object;
  import flash.events.TimerEvent;
  import flash.events.DRMAuthenticationErrorEvent;
  import Date;
  import flash.utils.Timer;
  import flash.events.Event;
  import flash.events.HTTPStatusEvent;
  import flash.utils.ByteArray;
  import flash.net.URLRequest;
  import flash.events.DRMErrorEvent;
  import flash.events.IOErrorEvent;
  import flash.events.DRMAuthenticationCompleteEvent;
  import flash.events.SecurityErrorEvent;
  import flash.net.URLLoader;
  import flash.net.drm.DRMContentData;
  import flash.events.DRMStatusEvent;
  import flash.events.TimerEvent;
  import SecurityError;
  import flash.events.DRMAuthenticationErrorEvent;
  import flash.net.drm.LoadVoucherSetting;
  import flash.net.URLRequestHeader;
  import Date;
  import flash.utils.Timer;
  import flash.events.Event;
  import flash.events.HTTPStatusEvent;
  import ArgumentError;
  import flash.utils.ByteArray;
  import flash.net.URLRequest;
  import flash.events.DRMErrorEvent;
  import flash.events.IOErrorEvent;
  import flash.events.DRMAuthenticationCompleteEvent;
  import flash.events.SecurityErrorEvent;
  import flash.net.URLLoader;
  import flash.net.URLRequestMethod;
  import flash.net.URLLoaderDataFormat;
  import flash.events.DRMStatusEvent;
  internal class DRMURLDownloadContext extends EventDispatcher {
    public function DRMURLDownloadContext() {}
    public function httpPostAndReceiveASync(url:String, headerName:String, headerValue:String, data:ByteArray):void { notImplemented("httpPostAndReceiveASync"); }
    public function httpGetASync(url:String):void { notImplemented("httpGetASync"); }
  }
}
