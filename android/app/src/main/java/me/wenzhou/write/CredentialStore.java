package me.wenzhou.write;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class CredentialStore {
    private final File file;
    private final String alias;

    CredentialStore(Context context) { this(context, "github"); }
    CredentialStore(Context context, String provider) { alias = "wenzhou." + provider + ".token"; file = new File(context.getNoBackupFilesDir(), provider + "-credential.json"); }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    synchronized String read() throws Exception {
        if (!file.exists()) return "";
        JSONObject data = new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(data.getString("iv"), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(data.getString("ciphertext"), Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    synchronized void write(String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject data = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        WorkspaceFiles.atomic(file, data.toString().getBytes(StandardCharsets.UTF_8));
    }

    synchronized void clear() throws Exception { Files.deleteIfExists(file.toPath()); }
}
