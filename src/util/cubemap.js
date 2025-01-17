// Cubemap prefilter utility
// http://www.unrealengine.com/files/downloads/2013SiggraphPresentationsNotes.pdf
// http://http.developer.nvidia.com/GPUGems3/gpugems3_ch20.html
define(function (require) {

    var Texture2D = require('../Texture2D');
    var TextureCube = require('../TextureCube');
    var Texture = require('../Texture');
    var FrameBuffer = require('../FrameBuffer');
    var Pass = require('../compositor/Pass');
    var Material = require('../Material');
    var Shader = require('../Shader');
    var Skybox = require('../plugin/Skybox');
    var Scene = require('../Scene');
    var EnvironmentMapPass = require('../prePass/EnvironmentMap');
    var Renderer = require('../Renderer');
    var vendor = require('../core/vendor');
    var textureUtil = require('./texture');

    var integrateBRDFShaderCode = require('./shader/integrateBRDF.essl');
    var prefilterFragCode = require('./shader/prefilter.essl');

    var cubemapUtil = {};

    var targets = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

    /**
     * @param  {qtek.Renderer} renderer
     * @param  {qtek.Texture} envMap
     * @param  {Object} [textureOpts]
     * @param  {number} [textureOpts.width]
     * @param  {number} [textureOpts.height]
     * @param  {number} [textureOpts.type]
     * @param  {boolean} [textureOpts.encodeRGBM]
     * @param  {boolean} [textureOpts.decodeRGBM]
     * @param  {qtek.Texture2D} [normalDistribution]
     * @param  {qtek.Texture2D} [brdfLookup]
     */
    cubemapUtil.prefilterEnvironmentMap = function (
        renderer, envMap, textureOpts, normalDistribution, brdfLookup
    ) {
        if (!brdfLookup || !normalDistribution) {
            normalDistribution = cubemapUtil.generateNormalDistribution();
            brdfLookup = cubemapUtil.integrateBrdf(renderer, normalDistribution);
        }
        textureOpts =  textureOpts || {};

        var width = textureOpts.width || 64;
        var height = textureOpts.height || 64;

        var textureType = textureOpts.type || envMap.type;

        // Use same type with given envMap
        var prefilteredCubeMap = new TextureCube({
            width: width,
            height: height,
            type: textureType,
            flipY: false,
            mipmaps: []
        });

        // Needs a renderer with preserveDrawingBuffer
        var cubeMapRenderer = new Renderer({
            preserveDrawingBuffer: true
        });

        if (!prefilteredCubeMap.isPowerOfTwo()) {
            console.warn('Width and height must be power of two to enable mipmap.');
        }

        var size = Math.min(width, height);
        var mipmapNum = Math.log(size) / Math.log(2) + 1;

        var prefilterMaterial = new Material({
            shader: new Shader({
                vertex: Shader.source('qtek.skybox.vertex'),
                fragment: prefilterFragCode
            })
        });
        prefilterMaterial.set('normalDistribution', normalDistribution);

        textureOpts.encodeRGBM && prefilterMaterial.shader.define('fragment', 'RGBM_ENCODE');
        textureOpts.decodeRGBM && prefilterMaterial.shader.define('fragment', 'RGBM_DECODE');

        var dummyScene = new Scene();
        var skyEnv;

        if (envMap instanceof Texture2D) {
            // Convert panorama to cubemap
            var envCubemap = new TextureCube({
                width: textureOpts.width,
                height: textureOpts.height,
                type: textureType
            });
            textureUtil.panoramaToCubeMap(cubeMapRenderer, envMap, envCubemap, {
                // encodeRGBM so it can be decoded as RGBM
                encodeRGBM: textureOpts.decodeRGBM
            });
            envMap = envCubemap;
        }
        skyEnv = new Skybox({
            scene: dummyScene,
            material: prefilterMaterial
        });
        skyEnv.material.set('environmentMap', envMap);

        var envMapPass = new EnvironmentMapPass({
            texture: prefilteredCubeMap
        });

        var renderTargetTmp = new Texture2D({
            width: width,
            height: height,
            type: textureType
        });
        var frameBuffer = new FrameBuffer();
        var ArrayCtor = vendor[textureType === Texture.UNSIGNED_BYTE ? 'Uint8Array' : 'Float32Array'];
        for (var i = 0; i < mipmapNum; i++) {
            prefilteredCubeMap.mipmaps[i] = {
                pixels: {}
            };
            skyEnv.material.set('roughness', i / (targets.length - 1));

            // Tweak fov
            // http://the-witness.net/news/2012/02/seamless-cube-map-filtering/
            var n = renderTargetTmp.width;
            var fov = 2 * Math.atan(n / (n - 0.5)) / Math.PI * 180;

            for (var j = 0; j < targets.length; j++) {
                var pixels = new ArrayCtor(renderTargetTmp.width * renderTargetTmp.height * 4);
                frameBuffer.attach(cubeMapRenderer.gl, renderTargetTmp);
                frameBuffer.bind(cubeMapRenderer);

                var camera = envMapPass.getCamera(targets[j]);
                camera.fov = fov;
                cubeMapRenderer.render(dummyScene, camera);
                cubeMapRenderer.gl.readPixels(
                    0, 0, renderTargetTmp.width, renderTargetTmp.height,
                    Texture.RGBA, textureType, pixels
                );

                // var canvas = document.createElement('canvas');
                // var ctx = canvas.getContext('2d');
                // canvas.width = renderTargetTmp.width;
                // canvas.height = renderTargetTmp.height;
                // var imageData = ctx.createImageData(renderTargetTmp.width, renderTargetTmp.height);
                // for (var k = 0; k < pixels.length; k++) {
                //     imageData.data[k] = pixels[k];
                // }
                // ctx.putImageData(imageData, 0, 0);
                // document.body.appendChild(canvas);

                frameBuffer.unbind(cubeMapRenderer);
                prefilteredCubeMap.mipmaps[i].pixels[targets[j]] = pixels;
            }

            renderTargetTmp.width /= 2;
            renderTargetTmp.height /= 2;
            renderTargetTmp.dirty();
        }

        frameBuffer.dispose(cubeMapRenderer.gl);
        renderTargetTmp.dispose(cubeMapRenderer.gl);
        skyEnv.dispose(cubeMapRenderer.gl);
        // Remove gpu resource allucated in cubeMapRenderer
        normalDistribution.dispose(cubeMapRenderer.gl);

        cubeMapRenderer.dispose();

        return {
            environmentMap: prefilteredCubeMap,
            brdfLookup: brdfLookup,
            normalDistribution: normalDistribution,
            maxMipmapLevel: mipmapNum
        };
    };

    cubemapUtil.integrateBrdf = function (renderer, normalDistribution) {
        normalDistribution = normalDistribution || cubemapUtil.generateNormalDistribution();
        var frameBuffer = new FrameBuffer();
        var pass = new Pass({
            fragment : integrateBRDFShaderCode
        });

        var texture = new Texture2D({
            width: 512,
            height: 256,
            type: Texture.FLOAT,
            minFilter: Texture.NEAREST,
            magFilter: Texture.NEAREST,
            useMipmap: false
        });
        pass.setUniform('normalDistribution', normalDistribution);
        pass.setUniform('viewportSize', [512, 256]);
        pass.attachOutput(texture);
        pass.render(renderer, frameBuffer);

        frameBuffer.dispose(renderer.gl);

        return texture;
    };

    cubemapUtil.generateNormalDistribution = function (roughnessLevels, sampleSize) {

        // http://holger.dammertz.org/stuff/notes_HammersleyOnHemisphere.html
        // GLSL not support bit operation, use lookup instead
        // V -> i / N, U -> roughness
        var roughnessLevels = roughnessLevels || 256;
        var sampleSize = sampleSize || 1024;

        var normalDistribution = new Texture2D({
            width: roughnessLevels,
            height: sampleSize,
            type: Texture.FLOAT,
            minFilter: Texture.NEAREST,
            magFilter: Texture.NEAREST,
            useMipmap: false
        });
        var pixels = new Float32Array(sampleSize * roughnessLevels * 4);
        for (var i = 0; i < sampleSize; i++) {
            var x = i / sampleSize;
            // http://holger.dammertz.org/stuff/notes_HammersleyOnHemisphere.html
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators
            // http://stackoverflow.com/questions/1908492/unsigned-integer-in-javascript
            // http://stackoverflow.com/questions/1822350/what-is-the-javascript-operator-and-how-do-you-use-it
            var y = (i << 16 | i >>> 16) >>> 0;
            y = ((y & 1431655765) << 1 | (y & 2863311530) >>> 1) >>> 0;
            y = ((y & 858993459) << 2 | (y & 3435973836) >>> 2) >>> 0;
            y = ((y & 252645135) << 4 | (y & 4042322160) >>> 4) >>> 0;
            y = (((y & 16711935) << 8 | (y & 4278255360) >>> 8) >>> 0) / 4294967296;

            for (var j = 0; j < roughnessLevels; j++) {
                var roughness = j / roughnessLevels;
                var a = roughness * roughness;
                var phi = 2.0 * Math.PI * x;
                // CDF
                var cosTheta = Math.sqrt((1 - y) / (1 + (a * a - 1.0) * y));
                var sinTheta = Math.sqrt(1.0 - cosTheta * cosTheta);
                var offset = (i * roughnessLevels + j) * 4;
                pixels[offset] = sinTheta * Math.cos(phi);
                pixels[offset + 1] = sinTheta * Math.sin(phi);
                pixels[offset + 2] = cosTheta;
                pixels[offset + 3] = 1.0;
            }
        }
        normalDistribution.pixels = pixels;

        return normalDistribution;
    };

    return cubemapUtil;
});