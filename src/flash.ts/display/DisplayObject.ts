/**
 * Copyright 2013 Mozilla Foundation
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// Class: DisplayObject
module Shumway.AVM2.AS.flash.display {
  import notImplemented = Shumway.Debug.notImplemented;
  import throwError = Shumway.AVM2.Runtime.throwError;
  import assert = Shumway.Debug.assert;

  import BlendMode = flash.display.BlendMode; assert (BlendMode);
  import ColorTransform = flash.geom.ColorTransform; assert (ColorTransform);
  import Matrix = flash.geom.Matrix; assert (Matrix);
  import Point = flash.geom.Point; assert (Point);
  import Rectangle = flash.geom.Rectangle; assert (Rectangle);

  export enum Direction {
    Upward     = 1,
    Downward   = 2
  }

  /*
   * Invalid Bits:
   *
   * Invalid bits are used to mark path dependent properties of display objects as stale. To compute these properties we either have to
   * walk the tree all the way the root, or visit all children.
   *
   *       +---+
   *       | A |
   *       +---+
   *       /   \
   *   +---+   +---+
   *   | B |   | C |
   *   +---+   +---+
   *           /   \
   *       +---+   +---+
   *       | D |   | E |
   *       +---+   +---+
   *
   * We use a combination of eager invalid bit propagation and lazy property evaluation. If a node becomes invalid because one of its
   * local properties has changed, we mark all of its valid descendents as invalid. When computing dependent properties, we walk up
   * the tree until we find a valid node and propagate the computation lazily downwards, marking all the nodes along the path as
   * valid.
   *
   * Suppose we mark A as invalid, this causes nodes B, C, D, and E to become invalid. We then compute a path dependent property
   * on E, causing A, and C to become valid. If we mark A as invalid again, A and C become invalid again. We don't need to mark
   * parts of the tree that are already invalid.
   */
  export enum DisplayObjectFlags {
    None                                      = 0x0000,

    /**
     * Display object is visible.
     */
    Visible                                   = 0x0001,


    /**
     * Display object has invalid bounds.
     */
    InvalidBounds                             = 0x0004,

    /**
     * Display object has an invalid matrix because one of its local properties: x, y, scaleX, ... has been mutated.
     */
    InvalidMatrix                             = 0x0008,

    /**
     * Display object has an invalid concatenated matrix because its matrix or one of its ancestor's matrices has been mutated.
     */
    InvalidConcatenatedMatrix                 = 0x0010,

    /**
     * Display object has an invalid concatenated color transform because its color transform or one of its ancestor's color
     * transforms has been mutated.
     */
    InvalidConcatenatedColorTransform         = 0x0020,

    /**
     * Display object has changed since the last time it was drawn.
     */
    InvalidPaint                              = 0x0040,

    /**
     * Tobias: What's this?
     */
    Constructed                               = 0x0080,

    /**
     * Tobias: What's this?
     */
    Destroyed                                 = 0x0100,

    /**
     * Display object is owned by the timeline, meaning that it is under the control of the timeline and that a reference
     * to this object has not leaked into AS3 code via the DisplayObjectContainer methods |getChildAt|,  |getChildByName|
     * or through the execution of the symbol class constructor.
     */
    OwnedByTimeline                           = 0x0200,

    /**
     * Display object is animated by the timeline. It may no longer be owned by the timeline (|OwnedByTimeline|) but it
     * is still animated by it. If AS3 code mutates any property on the display object, this flag is cleared and further
     * timeline mutations are ignored.
     */
    AnimatedByTimeline                        = 0x0400,

    /**
     * Tobias: Should this really be just true of if any of the other invalid bits are on?
     */
    Invalid                                   = 0x0800,

    /**
     * Indicates whether this display object should be cached as a bitmap. The display object
     * may be cached as bitmap even if this flag is not set, depending on whether any filters
     * are applied or if the bitmap is too large or we've run out of memory.
     */
    CacheAsBitmap                             = 0x1000
  }

  export class DisplayObject extends flash.events.EventDispatcher implements IBitmapDrawable {

    private static _instances: DisplayObject [];

    // Called whenever the class is initialized.
    static classInitializer: any = function () {
      DisplayObject._instances = [];
    };

    /**
     * All display objects in the world need to be notified of certain events, here we keep track
     * of all the display objects that were ever constructed.
     */
    static register(object: DisplayObject) {
      DisplayObject._instances.push(object);
    }

    // Called whenever an instance of the class is initialized.
    static initializer: any = function (symbol: DisplayObject) {
      var self: DisplayObject = this;
      DisplayObject.register(self);

      self._flags = DisplayObjectFlags.None;
      self._root = null;
      self._stage = null;
      self._name = 'instance' + DisplayObject._instances.length;
      self._parent = null;
      self._mask = null;
      self._z = 0;
      self._scaleX = 1;
      self._scaleY = 1;
      self._scaleZ = 1;
      self._mouseX = 0;
      self._mouseY = 0;
      self._rotation = 0;
      self._rotationX = 0;
      self._rotationY = 0;
      self._rotationZ = 0;
      self._alpha = 1;
      self._width = 0;
      self._height = 0;
      self._opaqueBackground = null;
      self._scrollRect = null;
      self._filters = [];
      self._blendMode = BlendMode.NORMAL;
      self._scale9Grid = null;
      self._loaderInfo = null;
      self._accessibilityProperties = null;

      self._bounds = null;
      self._clipDepth = 0;

      self._concatenatedMatrix = new Matrix();
      self._matrix = new Matrix();
      self._matrix3D = null;
      self._colorTransform = new ColorTransform();

      self._depth = 0;
      self._graphics = null;
      self._hitTarget = null;
      self._index = -1;
      self._level = -1;
      self._maskedObject = null;

      // TODO get this via loaderInfo
      self._loader = null;

      self._removeFlags (
        DisplayObjectFlags.AnimatedByTimeline    |
        DisplayObjectFlags.InvalidBounds         |
        DisplayObjectFlags.Constructed           |
        DisplayObjectFlags.Destroyed             |
        DisplayObjectFlags.Invalid               |
        DisplayObjectFlags.OwnedByTimeline       |
        DisplayObjectFlags.InvalidMatrix
      );

      // TODO move to InteractiveObject
      self._mouseOver = false;

      // TODO move to DisplayObjectContainer
      self._children = [];
      self._isContainer = false;
      self._mouseChildren = true;

      if (symbol) {
        self._root        = symbol._root      || self._root;
        self._stage       = symbol._stage     || self._stage;
        self._name        = symbol._name      || self._stage;
        self._parent      = symbol._parent    || self._parent;
        self._clipDepth   = symbol._clipDepth || self._clipDepth;
        self._blendMode   = symbol._blendMode || self._blendMode;
        self._depth       = symbol._depth     || self._depth;
        self._loader      = symbol._loader    || self._loader;

        self._index       = isNaN(symbol._index) ? self._index : symbol._index;
        self._level       = isNaN(symbol._level) ? self._level : symbol._level;

        if (symbol._scale9Grid) {
          self._scale9Grid = symbol._scale9Grid.clone();
        }

        if (symbol._hasFlags(DisplayObjectFlags.AnimatedByTimeline)) {
          self._setFlags(DisplayObjectFlags.AnimatedByTimeline);
        }

        if (symbol.bbox) {
          var bbox = symbol.bbox;
          self._bounds.setTo(bbox.xMin, bbox.yMin, bbox.xMax - bbox.xMin, bbox.yMax - bbox.yMin);
        }

        if (symbol._matrix) {
          this._setMatrix(symbol._matrix, false);
        }

        if (symbol._colorTransform) {
          this._setColorTransform(symbol._colorTransform);
        }

        if (symbol._hasFlags(DisplayObjectFlags.OwnedByTimeline)) {
          self._setFlags(DisplayObjectFlags.OwnedByTimeline);
        }
      }
    };
    
    // List of static symbols to link.
    static staticBindings: string [] = null; // [];
    
    // List of instance symbols to link.
    static bindings: string [] = null; // ["hitTestObject", "hitTestPoint"];
    
    constructor () {
      false && super(undefined);
      notImplemented("Dummy Constructor: public flash.display.DisplayObject");
    }

    _setFlags(flags: DisplayObjectFlags) {
      this._flags |= flags;
    }

    _toggleFlags(flags: DisplayObjectFlags, on: boolean) {
      if (on) {
        this._flags |= flags;
      } else {
        this._flags &= ~flags;
      }
    }

    _removeFlags(flags: DisplayObjectFlags) {
      this._flags &= ~flags;
    }

    _hasFlags(flags: DisplayObjectFlags): boolean {
      return (this._flags & flags) === flags;
    }

    _hasAnyFlags(flags: DisplayObjectFlags): boolean {
      return !!(this._flags & flags);
    }

    /**
     * Propagates flags up and down the the display list.
     */
    _propagateFlags(flags: DisplayObjectFlags, direction: Direction) {
      if (this._hasFlags(flags)) {
        return;
      }
      this._setFlags(flags);

      if (direction & Direction.Upward) {
        var node = this._parent;
        while (node) {
          node._setFlags(flags);
          node = node._parent;
        }
      }

      if (direction & Direction.Downward) {
        if (this instanceof flash.display.DisplayObjectContainer) {
          var children = (<flash.display.DisplayObjectContainer>this)._children;
          for (var i = 0; i < children.length; i++) {
            if (!children[i]._hasFlags(flags)) {
              children[i]._propagateFlags(flags);
            }
          }
        }
      }
    }

    // JS -> AS Bindings
    
    hitTestObject: (obj: flash.display.DisplayObject) => boolean;
    hitTestPoint: (x: number, y: number, shapeFlag: boolean = false) => boolean;
    
    // AS -> JS Bindings

    private _flags: number;

    _root: flash.display.DisplayObject;
    _stage: flash.display.Stage;
    _name: string;
    _parent: flash.display.DisplayObjectContainer;
    _mask: flash.display.DisplayObject;
    _z: number;
    _scaleX: number;
    _scaleY: number;
    _scaleZ: number;
    _mouseX: number;
    _mouseY: number;
    _rotation: number;
    _rotationX: number;
    _rotationY: number;
    _rotationZ: number;
    _alpha: number;
    _width: number;
    _height: number;
    _opaqueBackground: ASObject;
    _scrollRect: flash.geom.Rectangle;
    _filters: any [];
    _blendMode: string;
    _scale9Grid: flash.geom.Rectangle;
    _loaderInfo: flash.display.LoaderInfo;
    _accessibilityProperties: flash.accessibility.AccessibilityProperties;

    /**
     * Bounding box excluding strokes.
     */
    _rect: flash.geom.Rectangle;

    /**
     * Bounding box including strokes.
     */
    _bounds: flash.geom.Rectangle;

    _children: flash.display.DisplayObject [];
    _clipDepth: number;
    _matrix: flash.geom.Matrix;
    _concatenatedMatrix: flash.geom.Matrix;
    _colorTransform: flash.geom.ColorTransform;
    _concatenatedColorTransform: flash.geom.ColorTransform;
    _matrix3D: flash.geom.Matrix3D;
    _depth: number;
    _graphics: flash.display.Graphics;
    _hitTarget: flash.display.DisplayObject;
    _index: number;
    _isContainer: boolean;
    _level: number;
    _loader: flash.display.Loader;
    _maskedObject: flash.display.DisplayObject;
    _mouseChildren: boolean;
    _mouseDown: boolean;
    _mouseOver: boolean;
    _zindex: number;

    /**
     * Finds the furthest ancestor with a given set of flags.
     */
    private _findFurthestAncestor(flags: DisplayObjectFlags, on: boolean): DisplayObject {
      var node = this;
      var last = this._stage;
      var oldest = null;
      while (node) {
        if (node._hasFlags(flags) === on) {
          oldest = node;
        }
        if (node === last) {
          break;
        }
        node = node._parent;
      }
      return oldest;
    }

    /**
     * Finds the closest ancestor with a given set of flags that are either turned on or off.
     */
    private _findClosestAncestor(flags: DisplayObjectFlags, on: boolean): DisplayObject {
      var node = this;
      var last = this._stage;
      while (node) {
        if (node._hasFlags(flags) === on) {
          return node;
        }
        if (node === last) {
          return null;
        }
        node = node._parent;
      }
      return null;
    }

    /**
     * Tests if the given display object is an ancestor of this display object.
     */
    private _isAncestor(ancestor: DisplayObject): boolean {
      var node = this;
      while (node) {
        if (node === ancestor) {
          return true;
        }
        node = node._parent;
      }
      return false;
    }

    /**
     * Used as a temporary array to avoid allocations.
     */
    private static _path: DisplayObject[] = [];

    /**
     * Return's a list of ancestors excluding the |last|, the return list is reused.
     */
    private static _getAncestors(node: DisplayObject, last: DisplayObject = null) {
      var path = DisplayObject._path;
      path.length = 0;
      while (node && node === last) {
        path.push(node);
        node = node._parent;
      }
      assert (node === last, "Last ancestor is not an ancestor.");
      return path;
    }

    /**
     * Computes the combined transformation matrixes of this display object and all of its parents. It is not
     * the same as |transform.concatenatedMatrix|, the latter also includes the screen space matrix.
     */
    _getConcatenatedMatrix(): Matrix {
      if (ancestor === this._parent) {
        return this._matrix;
      }
      // Compute the concatenated transforms for this node and all of its ancestors.
      if (this._hasFlags(DisplayObjectFlags.InvalidConcatenatedMatrix)) {
        var ancestor = this._findClosestAncestor(DisplayObjectFlags.InvalidConcatenatedMatrix, false);
        var path = DisplayObject._getAncestors(this, ancestor);
        var m = ancestor ? ancestor._concatenatedMatrix : new Matrix();
        for (var i = path.length - 1; i >= 0; i--) {
          var ancestor = path[i];
          assert (ancestor._hasFlags(DisplayObjectFlags.InvalidConcatenatedMatrix));
          m.concat(ancestor._matrix);
          ancestor._concatenatedMatrix.copyFrom(m);
          ancestor._removeFlags(DisplayObjectFlags.InvalidConcatenatedMatrix);
        }
      }
      return this._concatenatedMatrix;
    }

    _setMatrix(matrix: Matrix, toTwips: boolean): void {
      var m = this._matrix;
      m.copyFrom(matrix);
      if (toTwips) {
        m.toTwips();
      }
      var angleInRadians = matrix.getRotation();
      this._rotation = angleInRadians * 180 / Math.PI;
      this._scaleX = m.getScaleX();
      this._scaleY = m.getScaleY();
      this._removeFlags(DisplayObjectFlags.InvalidMatrix);
      this._invalidatePosition();
    }

    /**
     * Computes the combined transformation color matrixes of this display object and all of its ancestors.
     */
    _getConcatenatedColorTransform(): ColorTransform {
      if (ancestor === this._parent) {
        return this._colorTransform;
      }
      // Compute the concatenated color transforms for this node and all of its ancestors.
      if (this._hasFlags(DisplayObjectFlags.InvalidConcatenatedColorTransform)) {
        var ancestor = this._findClosestAncestor(DisplayObjectFlags.InvalidConcatenatedColorTransform, false);
        var path = DisplayObject._getAncestors(this, ancestor);
        var m = ancestor ? ancestor._concatenatedColorTransform : new ColorTransform();
        for (var i = path.length - 1; i >= 0; i--) {
          var ancestor = path[i];
          assert (ancestor._hasFlags(DisplayObjectFlags.InvalidConcatenatedColorTransform));
          m.concat(ancestor._colorTransform);
          ancestor._concatenatedColorTransform.copyFrom(m);
          ancestor._removeFlags(DisplayObjectFlags.InvalidConcatenatedColorTransform);
        }
      }
      return this._concatenatedColorTransform;
    }

    _setColorTransform(colorTransform: flash.geom.ColorTransform) {
      this._colorTransform.copyFrom(colorTransform);
      this._propagateFlags(DisplayObjectFlags.InvalidConcatenatedColorTransform, Direction.Downward);
      this._invalidatePaint();
    }

    /**
     * Invalidates the bounds of this display object along with all of its ancestors.
     */
    _invalidateBounds(): void {
      this._propagateFlags(DisplayObjectFlags.InvalidBounds, Direction.Upward);
    }

    /**
     * Computes the bounding box for all of this display object's content, its graphics and all of its children.
     */
    private _getContentBounds(includeStrokes: boolean = true): Rectangle {
      // Tobias: What about filters?
      var rectangle = includeStrokes ? this._bounds : this._rect;
      if (this._hasFlags(DisplayObjectFlags.InvalidBounds)) {
        rectangle.setEmpty();
        var graphics: Graphics = null;
        if (this instanceof Shape) {
          graphics = (<Shape>this)._graphics;
        } else if (this instanceof Sprite) {
          graphics = (<Sprite>this)._graphics;
        }
        if (graphics) {
          rectangle.unionWith(graphics._getContentBounds(includeStrokes));
        }
        if (this instanceof flash.display.DisplayObjectContainer) {
          var container: flash.display.DisplayObjectContainer = <flash.display.DisplayObjectContainer>this;
          for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (includeStrokes) {
              rectangle.unionWith(child.getBounds(this));
            } else {
              rectangle.unionWith(child.getRect(this));
            }
          }
        }
        this._removeFlags(DisplayObjectFlags.InvalidBounds);
      }
      return rectangle;
    }

    private _getTransformedBounds(targetCoordinateSpace: DisplayObject, includeStroke: boolean = true, toPixels: boolean = false) {
      var bounds = this._getContentBounds(includeStroke).clone();
      if (!targetCoordinateSpace || targetCoordinateSpace === this || bounds.isEmpty()) {
        return bounds.clone();
      }
      // MBX: Probably broken.
      var t = targetCoordinateSpace._getConcatenatedMatrix();
      t.invert();
      t.concat(this._getConcatenatedMatrix());
      t.transformRectAABB(bounds);
      if (toPixels) {
        bounds.toPixels();
      }
      return bounds;
    }

    /**
     * Marks this object as needing to be repainted.
     */
    private _invalidatePaint() {
      this._propagateFlags(DisplayObjectFlags.InvalidPaint, Direction.Upward);
    }

    /**
     * Marks this object as having been moved.
     */
    private _invalidatePosition() {
      // Tobias: Do we set this flag only if the assignment is successful?
      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
      this._propagateFlags(DisplayObjectFlags.InvalidConcatenatedMatrix, Direction.Downward);
      if (this._parent) {
        this._parent._invalidateBounds();
      }
    }

    get x(): number {
      return this._matrix.tx / 20;
    }

    set x(value: number) {
      value = (value * 20) | 0;
      if (value === this._matrix.tx) {
        return;
      }
      this._matrix.tx = value;
      this._invalidatePosition();
    }

    get y(): number {
      return this._matrix.ty / 20;
    }

    set y(value: number) {
      value = (value * 20) | 0;
      if (value === this._matrix.ty) {
        return;
      }
      this._matrix.ty = value;
      this._invalidatePosition();
    }

    get mask(): flash.display.DisplayObject {
      return this._mask;
    }

    set mask(value: flash.display.DisplayObject) {
      if (this._mask === value || value === this) {
        return;
      }

      if (value && value._maskedObject) {
        value._maskedObject.mask = null;
      }
      this._mask = value;
      if (value) {
        value._maskedObject = this;
      }
      this._invalidatePaint();
      // Tobias: Does masking affect the bounds?
    }

    get transform(): flash.geom.Transform {
      return new flash.geom.Transform(this);
    }

    set transform(value: flash.geom.Transform) {
      if (value.matrix3D) {
        this._matrix3D = value.matrix3D;
      } else {
        this._setMatrix(transform.matrix, true);
      }
      this._setColorTransform(value.colorTransform);
    }

    private destroy(): void {
      this._setFlags(DisplayObjectFlags.Destroyed);
    }

    get root(): flash.display.DisplayObject {
      return this._root;
    }

    get stage(): flash.display.Stage {
      return this._stage;
    }

    get name(): string {
      return this._name;
    }

    set name(value: string) {
      this._name = "" + value;
    }

    get parent(): flash.display.DisplayObjectContainer {
      return this._parent;
    }

    get visible(): boolean {
      return this._hasFlags(DisplayObjectFlags.Visible);
    }

    set visible(value: boolean) {
      value = !!value;
      if (value === this._hasFlags(DisplayObjectFlags.Visible)) {
        return;
      }
      this._setFlags(DisplayObjectFlags.Visible);
      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
      // Tobias: Does visibility affect the bounds?
    }

    get z(): number {
      return this._z;
    }
    set z(value: number) {
      value = +value;
      notImplemented("public flash.display.DisplayObject::set z"); return;
      // this._z = value;
    }

    // ---------------------------------------------------------------------------------------------------------------------------------------------
    // -- Stuff below we still need to port.                                                                                                      --
    // ---------------------------------------------------------------------------------------------------------------------------------------------

    /*
    get scaleX(): number {
      return this._scaleX;
    }

    set scaleX(value: number) {
      value = +value;

      if (value === this._scaleX) {
        return;
      }

      var m = currentTransform;
      m.a = Math.cos(this._rotation) * value;
      m.b = Math.sin(this._rotation) * value;

      this._scaleX = value;
      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
      this._invalidate();
      this._invalidateTransform();
    }

    get scaleY(): number {
      return this._scaleY;
    }

    set scaleY(value: number) {
      value = +value;

      if (value === this._scaleY) {
        return;
      }

      var m = this._matrix;
      m.c = Math.sin(-this._rotation) * value;
      m.d = Math.cos(this._rotation) * value;

      this._scaleY = value;
      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
      this._invalidate();
      this._invalidateTransform();
    }

    get scaleZ(): number {
      return this._scaleZ;
    }
    set scaleZ(value: number) {
      value = +value;
      notImplemented("public flash.display.DisplayObject::set scaleZ"); return;
      // this._scaleZ = value;
    }
    get mouseX(): number {
      return this._mouseX / 20;
    }
    get mouseY(): number {
      return this._mouseY / 20;
    }
    get rotation(): number {
      return this._rotation;
    }
    set rotation(value: number) {
      value = +value;

      value %= 360;
      if (value > 180) {
        value -= 360;
      }

      if (value === this._rotation) {
        return;
      }

      var angle = value / 180 * Math.PI;
      var u, v;
      switch (value) {
        case 0:
        case 360:
          u = 1, v = 0;
          break;
        case 90:
        case -270:
          u = 0, v = 1;
          break;
        case 180:
        case -180:
          u = -1, v = 0;
          break;
        case 270:
        case -90:
          u = 0, v = -1;
          break;
        default:
          u = Math.cos(angle);
          v = Math.sin(angle);
          break;
      }

      var m = this._matrix;
      m.a = u * this._scaleX;
      m.b = v * this._scaleX;
      m.c = -v * this._scaleY;
      m.d = u * this._scaleY;

      this._rotation = value;
      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
      this._invalidate();
      this._invalidateTransform();
    }
    get rotationX(): number {
      return this._rotationX;
    }
    set rotationX(value: number) {
      value = +value;
      notImplemented("public flash.display.DisplayObject::set rotationX"); return;
      // this._rotationX = value;
    }
    get rotationY(): number {
      return this._rotationY;
    }
    set rotationY(value: number) {
      value = +value;
      notImplemented("public flash.display.DisplayObject::set rotationY"); return;
      // this._rotationY = value;
    }
    get rotationZ(): number {
      return this._rotationZ;
    }
    set rotationZ(value: number) {
      value = +value;
      notImplemented("public flash.display.DisplayObject::set rotationZ"); return;
      // this._rotationZ = value;
    }
    get alpha(): number {
      return this._alpha;
    }
    set alpha(value: number) {
      value = +value;

      if (value === this._alpha) {
        return;
      }

      this._alpha = value;
      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
      this._invalidate();
    }
    get width(): number {
      var bounds = this._getContentBounds();
      var m = this._matrix;
      return (Math.abs(m.a) * bounds.width +
              Math.abs(m.c) * bounds.height) / 20;
    }
    set width(value: number) {
      value = +value;

      if (value < 0) {
        return;
      }

      var u = Math.abs(Math.cos(this._rotation));
      var v = Math.abs(Math.sin(this._rotation));
      var bounds = this._getContentBounds();
      var baseWidth = u * bounds.width + v * bounds.height;

      if (!baseWidth) {
        return;
      }

      var baseHeight = v * bounds.width + u * bounds.height;
      this.scaleY = this.height / baseHeight;
      this.scaleX = ((value * 20) | 0) / baseWidth;
    }
    get height(): number {
      var bounds = this._getContentBounds();
      var m = this._matrix;
      return (Math.abs(m.b) * bounds.width +
              Math.abs(m.d) * bounds.height) / 20;
    }
    set height(value: number) {
      value = +value;

      if (value < 0) {
        return;
      }

      var u = Math.abs(Math.cos(this._rotation));
      var v = Math.abs(Math.sin(this._rotation));
      var bounds = this._getContentBounds();
      var baseHeight = v * bounds.width + u * bounds.height;

      if (!baseHeight) {
        return;
      }

      var baseWidth = u * bounds.width + v * bounds.height;
      this.scaleX = this.width / baseWidth;
      this.scaleY = ((value * 20) | 0) / baseHeight;
    }

    get cacheAsBitmap(): boolean {
      return this._filters.length > 0 || this._hasFlags(DisplayObjectFlags.CacheAsBitmap);
    }

    set cacheAsBitmap(value: boolean) {
      value = !!value;
      if (!this._filters.length) {
        this._toggleFlags(DisplayObjectFlags.CacheAsBitmap, value);
      }
      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
    }

    get opaqueBackground(): Object {
      return this._opaqueBackground;
    }
    set opaqueBackground(value: Object) {
      value = value;
      notImplemented("public flash.display.DisplayObject::set opaqueBackground"); return;
      // this._opaqueBackground = value;
    }
    get scrollRect(): flash.geom.Rectangle {
      return this._scrollRect;
    }
    set scrollRect(value: flash.geom.Rectangle) {
      value = value;
      notImplemented("public flash.display.DisplayObject::set scrollRect"); return;
      // this._scrollRect = value;
    }
    get filters(): any [] {
      return this._filters;
    }
    set filters(value: any []) {
      //value = value;

      this._invalidate();
      this._filters = value;
      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
    }
    get blendMode(): string {
     return this._blendMode;
    }
    set blendMode(value: string) {
      value = "" + value;

      if (this._blendMode === value) {
        return;
      }

      if (BlendMode.isMember(value)) {
        this._blendMode = value;
      } else {
        throwError("ArgumentError", Errors.InvalidEnumError, "blendMode");
      }

      this._removeFlags(DisplayObjectFlags.AnimatedByTimeline);
      this._invalidate();
    }

    get scale9Grid(): flash.geom.Rectangle {
      return this._scale9Grid;
    }
    set scale9Grid(innerRectangle: flash.geom.Rectangle) {
      innerRectangle = innerRectangle;
      notImplemented("public flash.display.DisplayObject::set scale9Grid"); return;
      // this._scale9Grid = innerRectangle;
    }
    get loaderInfo(): flash.display.LoaderInfo {
      return (this._loader && this._loader._contentLoaderInfo) ||
             (this._parent && this._parent.loaderInfo);
    }
    get accessibilityProperties(): flash.accessibility.AccessibilityProperties {
      return this._accessibilityProperties;
    }
    set accessibilityProperties(value: flash.accessibility.AccessibilityProperties) {
      value = value;
      notImplemented("public flash.display.DisplayObject::set accessibilityProperties"); return;
      // this._accessibilityProperties = value;
    }
    set blendShader(value: flash.display.Shader) {
      value = value;
      notImplemented("public flash.display.DisplayObject::set blendShader"); return;
      // this._blendShader = value;
    }
    globalToLocal(point: flash.geom.Point): flash.geom.Point {
      //point = point;
      var m = this._getConcatenatedMatrix(null).clone();
      m.invert();
      var p = m.transformCoords(point.x, point.y, true);
      p.toPixels();
      return p;
    }
    localToGlobal(point: flash.geom.Point): flash.geom.Point {
      //point = point;
      var m = this._getConcatenatedMatrix(null);
      var p = m.transformCoords(point.x, point.y, true);
      p.toPixels();
      return p;
    }
    getBounds(targetCoordinateSpace: flash.display.DisplayObject): flash.geom.Rectangle {
      //targetCoordinateSpace = targetCoordinateSpace;
      return this._getTransformedBounds(targetCoordinateSpace, true, true);
    }
    getRect(targetCoordinateSpace: flash.display.DisplayObject): flash.geom.Rectangle {
      //targetCoordinateSpace = targetCoordinateSpace;
      return this._getTransformedBounds(targetCoordinateSpace, false, true);
    }
    globalToLocal3D(point: flash.geom.Point): flash.geom.Vector3D {
      point = point;
      notImplemented("public flash.display.DisplayObject::globalToLocal3D"); return;
    }
    local3DToGlobal(point3d: flash.geom.Vector3D): flash.geom.Point {
      point3d = point3d;
      notImplemented("public flash.display.DisplayObject::local3DToGlobal"); return;
    }
    _hitTest(use_xy: boolean, x: number, y: number, useShape: boolean, hitTestObject: flash.display.DisplayObject): boolean {
      use_xy = !!use_xy; x = +x; y = +y; useShape = !!useShape;
      //hitTestObject = hitTestObject;

      if (use_xy) {
        var m = this._getConcatenatedMatrix(null).clone();
        m.invert();
        var point = m.transformCoords(x, y);

        var b = this._getContentBounds();
        if (!b.containsPoint(point)) {
          return false;
        }

        if (!useShape || !this._graphics) {
          return true;
        }

        // TODO move into Graphics
        if (this._graphics) {
          var paths = this._graphics._paths;
          for (var i = 0; i < paths.length; i++) {
            var path = paths[i];

            if (path.isPointInPath(point.x, point.y)) {
              return true;
            }

            if (path.strokeStyle) {
              var strokePath = path._strokePath;
              if (!strokePath) {
                strokePath = path.strokePath(path.drawingStyles);
                path._strokePath = strokePath;
              }

              if (strokePath.isPointInPath(point.x, point.y)) {
                return true;
              }
            }
          }
        }

        var children = this._children;
        for (var i = 0; i < children.length; i++) {
          var child = children[i];
          if (child._hitTest(true, x, y, true, null)) {
            return true;
          }
        }

        return false;
      }

      var b1 = this.getBounds(this._stage);
      var b2 = hitTestObject.getBounds(hitTestObject._stage);
      return b1.intersects(b2);
    }
   */
  }
}
