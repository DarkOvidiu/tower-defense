var TowerDefense = TowerDefense || {

    revision: 1,
    __currentLevel: 1,
    __pause: true,
    __loading: false,
    gameWidth: window.innerWidth,
    gameHeight: window.innerHeight,
    /**
     * Holds all the game objects. The .update() function will be called for each main
     * update.
     */
    objects: [],
    grid: [], // holds the x, y position of each tile and it's tile object
    gridPath: [], // holds the x, y position of each tile and a zero (open) or one (closed)
    nodes: [], // Holds the x, y position and GraphNode object,

    /**
     * Holds THREE.js objects for rendering the WebGL canvas such as scene, camera and
     * projector for the game.
     */
    scene: {},
    camera: {},
    renderer: {},
    projector: {},
    manager: {}, // Holds three js loading manager

    controls: {}, // Hold the controls for camera movement

    meshObjects: [], // List with key => array(file, key, mesh)
    meshTextures: [], // list with key => array(file, key, texture)

    /**
     * Settings for the game/objects
     */
    settings: {

        debug: false,
        advancedLight: true,
        advancedMaterials: true

    },

    /**
     * Object with game stats like score, resources, etc
     */
    stats: {
        score: 0,
        resources: 0,
        lives: 50
    },

    /**
     * Holds all available towers to build with their info
     */
    availableTowers: [
        {
            object: function() { return new TowerDefense.BasicTower(); }
        },
        {
            object: function() { return new TowerDefense.AdvancedTower(); }
        },
        {
            object: function() { return new TowerDefense.BadAssTower(); }
        }
    ],

    /**
     * Holds the tile where monsters will spawn
     * @type {{}}
     */
    startTile: {},

    /**
     * Holds the tile where monsters will despawn
     * @type {{}}
     */
    endTile: {},

    /**
     * Holds the current selected Object
     */
    selectedObject: {},

    /**
     * Holds the a* object for calculating paths
     * @todo remove
     */


    initialize: function() {

        TowerDefense.Ui.initialize();

        this.manager = new THREE.LoadingManager();
        this.manager.onProgress = function ( item, loaded, total ) {

            TowerDefense.Ui.loadingProgress(item, loaded, total);

        };

    },

    /**
     * Loops throught this.meshObjects and this.meshTextures and loads (and fills) the
     * files.
     * @param callback
     */
    loadObjects: function(callback) {

        var meshLoader = new THREE.OBJLoader( this.manager );
        var textureLoader = new THREE.ImageLoader( this.manager );

        var totalLoaded = 0;

        this.meshObjects.forEach (function (mesh) {
            var key = mesh.key;
            if (TowerDefense.meshObjects[key] == null) {
                TowerDefense.meshObjects[key] = {};
            }
            if (mesh.object == null || mesh.object == '') {
                totalLoaded++;
                TowerDefense.meshObjects[key].object = '';
                meshLoader.load( mesh.file, function ( object ) {
                    TowerDefense.meshObjects[key].object = object.children[0];
                    totalLoaded--;
                    finishedLoading();
                } );
            }
        });

        this.meshTextures.forEach (function (texture) {
            var key = texture.key;
            if (TowerDefense.meshTextures[key] == null) {
                TowerDefense.meshTextures[key] = {};
            }
            if (texture.texture == null || texture.texture == '') {
                totalLoaded++;
                TowerDefense.meshTextures[key].texture = new THREE.Texture();
                textureLoader.load( texture.file, function ( image ) {

                    TowerDefense.meshTextures[key].texture.image = image;
                    TowerDefense.meshTextures[key].texture.needsUpdate = true;

                    totalLoaded--;
                    finishedLoading();
                } );
            }
        });

        var finishedLoading = function() {
            if (totalLoaded <= 0 && typeof callback == 'function') {
                callback();
            }

        }

    },

    __addObject: function (object) {

        // Loop through already placed objects and updates them if needed for the lights.
        // https://github.com/mrdoob/three.js/wiki/Updates#materials
        // @todo improve speed
        this.objects.forEach( function (object) {
            if (object.material != null) {
                object.material.needsUpdate = true;
            }
            if (object.material.map != null) {
                object.material.map.needsUpdate = true;
            }
        });
        this.objects[object.id] = object;
        return true;

    },

    __removeObject: function (object) {

        if (object.object != null) {
            TowerDefense.scene.remove(object.object);
        }
        delete(this.objects[object.id]);
        delete(object);

    },

    update: function() {

        this.objects.forEach( function(object) {

            object.update();

        });

        TWEEN.update();

        TowerDefense.Ui.update();

    },

    deselectAll: function() {

        this.objects.forEach(function(object, index) {

            if (typeof object.deselect == 'function') {

                object.deselect();

            }

        });

        TowerDefense.selectedObject = {};

    },

    /**
     * Loops through all enemies and update the path. Usefull after building a tower.
     */
    updateEnemyMovements: function() {

        this.objects.forEach( function(object) {

            if (object.type != null && object.type == 'ENEMY') {
                object.setPath();
            }

        });

    },

    Spline: function () {
        var c = [], v2 = { x: 0, y: 0, z: 0 },
          point, intPoint, weight;
        this.get2DPoint = function ( points, k ) {
            point = ( points.length - 1 ) * k;
            intPoint = Math.floor( point );
            weight = point - intPoint;
            c[ 0 ] = intPoint == 0 ? intPoint : intPoint - 1;
            c[ 1 ] = intPoint;
            c[ 2 ] = intPoint > points.length - 2 ? points.length - 1 : intPoint + 1;
            c[ 3 ] = intPoint > points.length - 3 ? points.length - 1 : intPoint + 2;
            v2.x = interpolate( points[ c[ 0 ] ].x, points[ c[ 1 ] ].x, points[ c[ 2 ] ].x, points[ c[ 3 ] ].x, weight );
            v2.y = interpolate( points[ c[ 0 ] ].y, points[ c[ 1 ] ].y, points[ c[ 2 ] ].y, points[ c[ 3 ] ].y, weight );
            v2.z = interpolate( points[ c[ 0 ] ].z, points[ c[ 1 ] ].z, points[ c[ 2 ] ].z, points[ c[ 3 ] ].z, weight );
            // Get current point
            v2.gridPosition = points[c[1]].gridPosition;
            return v2;
        }
        // Catmull-Rom
        function interpolate( p0, p1, p2, p3, t ) {
            var v0 = ( p2 - p0 ) * 0.5;
            var v1 = ( p3 - p1 ) * 0.5;
            var t2 = t * t;
            var t3 = t * t2;
            return ( 2 * p1 - 2 * p2 + v0 + v1 ) * t3 + ( - 3 * p1 + 3 * p2 - 2 * v0 - v1 ) * t2 + v0 * t + p1;
        }
    }

}