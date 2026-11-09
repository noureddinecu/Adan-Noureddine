package app.noortv.phone;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Hands the camera app one file to write the photo into (content://app.noortv.phone.cam/cam.jpg), and the
 * WebView the same file to read back. A tiny stand-in for AndroidX's FileProvider.
 */
public class CamProvider extends ContentProvider {
    static final Uri URI = Uri.parse("content://app.noortv.phone.cam/cam.jpg");

    static File file(android.content.Context c) {
        return new File(c.getCacheDir(), "cam.jpg");
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        int m = mode.contains("w")
                ? ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE
                : ParcelFileDescriptor.MODE_READ_ONLY;
        return ParcelFileDescriptor.open(file(getContext()), m);
    }

    @Override
    public String getType(Uri uri) {
        return "image/jpeg";
    }

    @Override
    public Cursor query(Uri uri, String[] p, String s, String[] a, String o) {
        android.database.MatrixCursor c = new android.database.MatrixCursor(
                new String[]{android.provider.OpenableColumns.DISPLAY_NAME, android.provider.OpenableColumns.SIZE});
        c.addRow(new Object[]{"cam.jpg", file(getContext()).length()});
        return c;
    }

    @Override
    public Uri insert(Uri uri, ContentValues v) {
        return null;
    }

    @Override
    public int delete(Uri uri, String s, String[] a) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues v, String s, String[] a) {
        return 0;
    }
}
