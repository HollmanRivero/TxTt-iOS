package com.txtt.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Tillat at WebRTC-lyd (remote <audio autoplay>) spilles av uten et nytt
        // bruker-trykk. Uten dette blokkerer Android WebView den forste
        // avspillingen -> stille forste samtale, lyd forst andre gang.
        getBridge().getWebView().getSettings()
                .setMediaPlaybackRequiresUserGesture(false);
    }
}
