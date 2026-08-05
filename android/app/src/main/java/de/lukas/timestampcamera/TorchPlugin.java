package de.lukas.timestampcamera;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.Map;

/**
 * Torch control via the system camera service, as a fallback for WebViews that
 * accept the getUserMedia torch constraint and then quietly do nothing.
 *
 * A TorchCallback tracks what the system reports the LED is actually doing, so
 * the app can tell "switched on" apart from "call returned without effect" —
 * setTorchMode can be silently overridden while another client (our own WebView
 * preview) holds the camera.
 */
@CapacitorPlugin(name = "Torch")
public class TorchPlugin extends Plugin {

    private CameraManager manager;
    private final Map<String, Boolean> torchStates = new HashMap<>();
    private final Map<String, Boolean> torchAvailable = new HashMap<>();
    private String lastError;

    @Override
    public void load() {
        manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
        if (manager == null) return;
        try {
            manager.registerTorchCallback(
                new CameraManager.TorchCallback() {
                    @Override
                    public void onTorchModeChanged(String cameraId, boolean enabled) {
                        torchStates.put(cameraId, enabled);
                        torchAvailable.put(cameraId, true);
                    }

                    @Override
                    public void onTorchModeUnavailable(String cameraId) {
                        torchAvailable.put(cameraId, false);
                    }
                },
                null
            );
        } catch (Exception e) {
            lastError = "registerTorchCallback: " + e.getMessage();
        }
    }

    /** Back camera that has a flash unit, or null. */
    private String findTorchCamera() throws Exception {
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics chars = manager.getCameraCharacteristics(id);
            Boolean hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
            Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
            if (Boolean.TRUE.equals(hasFlash)
                    && facing != null
                    && facing == CameraCharacteristics.LENS_FACING_BACK) {
                return id;
            }
        }
        // no back camera with flash — take any camera that has one
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics chars = manager.getCameraCharacteristics(id);
            if (Boolean.TRUE.equals(chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE))) return id;
        }
        return null;
    }

    @PluginMethod
    public void setTorch(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (manager == null) {
            call.reject("Kein Kameradienst verfügbar.");
            return;
        }
        try {
            String id = findTorchCamera();
            if (id == null) {
                call.reject("Keine Kamera mit Blitz gefunden.");
                return;
            }
            manager.setTorchMode(id, on);
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("cameraId", id);
            call.resolve(result);
        } catch (Exception e) {
            lastError = e.getClass().getSimpleName() + ": " + e.getMessage();
            call.reject(lastError);
        }
    }

    /** Everything the system knows about the flash — the basis for diagnosis. */
    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("sdk", Build.VERSION.SDK_INT);
        result.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        if (lastError != null) result.put("lastError", lastError);

        if (manager == null) {
            result.put("error", "Kein Kameradienst verfügbar.");
            call.resolve(result);
            return;
        }

        try {
            JSArray cameras = new JSArray();
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics chars = manager.getCameraCharacteristics(id);
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                JSObject camera = new JSObject();
                camera.put("id", id);
                camera.put("flash", Boolean.TRUE.equals(chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE)));
                camera.put("facing", facing == null ? "?" : facing == 1 ? "back" : facing == 0 ? "front" : "ext");
                if (torchStates.containsKey(id)) camera.put("torchOn", torchStates.get(id));
                if (torchAvailable.containsKey(id)) camera.put("torchAvailable", torchAvailable.get(id));
                cameras.put(camera);
            }
            result.put("cameras", cameras);
            String torchCamera = findTorchCamera();
            result.put("torchCameraId", torchCamera == null ? "" : torchCamera);
            if (torchCamera != null) {
                Boolean state = torchStates.get(torchCamera);
                result.put("torchOn", state == null ? "unbekannt" : state.toString());
                Boolean available = torchAvailable.get(torchCamera);
                result.put("torchAvailable", available == null ? "unbekannt" : available.toString());
            }
        } catch (Exception e) {
            result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        call.resolve(result);
    }
}
