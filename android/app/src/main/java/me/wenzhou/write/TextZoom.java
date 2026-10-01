package me.wenzhou.write;
import android.os.Build;
import android.view.MotionEvent;
import android.view.KeyEvent;
final class TextZoom {
 static float factor(MotionEvent event) {
  if (Build.VERSION.SDK_INT >= 34) {float pinch=event.getAxisValue(MotionEvent.AXIS_GESTURE_PINCH_SCALE_FACTOR);if(pinch>0 && pinch!=1)return Math.max(.5f,Math.min(2f,pinch));}
  if(event.getActionMasked()==MotionEvent.ACTION_SCROLL&&((event.getMetaState() & (KeyEvent.META_CTRL_ON | KeyEvent.META_META_ON)) != 0))return (float)Math.exp(event.getAxisValue(MotionEvent.AXIS_VSCROLL)*.10);
  return 1;
 }
}
