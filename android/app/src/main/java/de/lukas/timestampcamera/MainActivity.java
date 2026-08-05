package de.lukas.timestampcamera;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TorchPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
