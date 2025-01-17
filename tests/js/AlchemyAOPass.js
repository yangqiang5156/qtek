define(function (require) {
    var qtek = require('qtek');
    var Matrix4 = qtek.math.Matrix4;
    var Vector2 = qtek.math.Vector2;
    var PostProcessPass = require('./PostProcessPass');

    qtek.Shader.import(require('text!../shader/alchemy.essl'));

    function generateKernel(size) {
        var kernel = new Float32Array(size * 2);
        var v2 = new Vector2();

        // Hardcoded 3 REPEAT
        var repeat = 3;
        // Spiral sample
        for (var i = 0; i < size; i++) {
            var angle = i / size * Math.PI * 2 * repeat;
            v2.set(
                i / size * Math.cos(angle),
                i / size * Math.sin(angle)
            );
            // v2.set(Math.random() * 2 - 1, Math.random() * 2 - 1)
            //     .normalize().scale(Math.random());
            kernel[i * 2] = v2.x;
            kernel[i * 2 + 1] = v2.y;
        }

        return kernel;
    }

    function generateNoiseData(size) {
        var data = new Uint8Array(size * size * 4);
        var n = 0;
        var v2 = new Vector2();
        for (var i = 0; i < size; i++) {
            for (var j = 0; j < size; j++) {
                v2.set(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
                data[n++] = (v2.x * 0.5 + 0.5) * 255;
                data[n++] = (v2.y * 0.5 + 0.5) * 255;
                data[n++] = 0;
                data[n++] = 255;
            }
        }
        return data;
    }

    function generateNoiseTexture(size) {
        return new qtek.Texture2D({
            pixels: generateNoiseData(size),
            wrapS: qtek.Texture.REPEAT,
            wrapT: qtek.Texture.REPEAT,
            minFilter: qtek.Texture.NEAREST,
            magFilter: qtek.Texture.NEAREST,
            width: size,
            height: size
        });
    }

    function AlchemyAO(opt) {
        opt = opt || {};

        this._gBuffer = opt.gBuffer;

        this._ssaoPass = new PostProcessPass(qtek.Shader.source('alchemy.fragment'), true, [1, 1, 1, 1]);

        this._blurPass1 = new PostProcessPass(qtek.Shader.source('alchemy.blur_h'), true);
        this._blurPass2 = new PostProcessPass(qtek.Shader.source('alchemy.blur_v'), opt.renderToTexture);

        this._blurPass1.setUniform('colorTex', this._ssaoPass.getTargetTexture());
        this._blurPass1.setUniform('normalTex', this._gBuffer.getNormalTex());
        this._blurPass2.setUniform('colorTex', this._blurPass1.getTargetTexture());
        this._blurPass2.setUniform('normalTex', this._gBuffer.getNormalTex());

        this.setKernelSize(opt.kernelSize || 12);
        this.setParameter('blurSize', opt.blurSize || 1);
        this.setParameter('noiseSize', opt.noiseSize || 4);
        if (opt.radius != null) {
            this.setParameter('radius', opt.radius);
        }
        if (opt.power != null) {
            this.setParameter('power', opt.power);
        }

        if (!opt.renderToTexture) {
            this._blurPass2._pass.material.blend = function (gl) {
                gl.blendEquation(gl.FUNC_ADD);
                gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
            };
            this._blurPass2._pass.blendWithPrevious = true;
        }
    }

    AlchemyAO.prototype.render = function (renderer, camera) {
        var width = renderer.getWidth();
        var height = renderer.getHeight();
        var gBuffer = this._gBuffer;
        var ssaoPass = this._ssaoPass;

        ssaoPass.setUniform('normalTex', gBuffer.getNormalTex());
        ssaoPass.setUniform('depthTex', gBuffer.getDepthTex());
        ssaoPass.setUniform('textureSize', [width, height]);
        ssaoPass.setUniform('viewportSize', [width, height]);

        var viewInverseTranspose = new Matrix4();
        Matrix4.transpose(viewInverseTranspose, camera.worldTransform);

        ssaoPass.setUniform('projection', camera.projectionMatrix._array);
        ssaoPass.setUniform('projectionInv', camera.invProjectionMatrix._array);
        ssaoPass.setUniform('viewInverseTranspose', viewInverseTranspose._array);

        var ssaoTexture = this._ssaoPass.getTargetTexture();
        if (width !== ssaoTexture.width || height !== ssaoTexture.height) {
            this._ssaoPass.resize(width, height);
            this._blurPass1.resize(width, height);
            this._blurPass2.resize(width, height);
        }
        ssaoPass.render(renderer);

        this._blurPass1.setUniform('textureSize', [width, height]);
        this._blurPass1.render(renderer);
        this._blurPass2.setUniform('textureSize', [width, height]);
        this._blurPass2.render(renderer);

    };

    AlchemyAO.prototype.setParameter = function (name, val) {
        if (name === 'kernelSize') {
            this.setKernelSize(val);
        }
        else if (name === 'noiseSize') {
            this.setNoiseSize(val);
        }
        else if (name === 'blurSize') {
            this._blurPass1.setUniform('blurSize', val);
            this._blurPass2.setUniform('blurSize', val);
        }
        else {
            this._ssaoPass.setUniform(name, val);
        }
    };

    AlchemyAO.prototype.setKernelSize = function (size) {
        this._ssaoPass.getShader().define('fragment', 'KERNEL_SIZE', size);
        var kernel = generateKernel(size);
        this._ssaoPass.setUniform('kernel', kernel);
    };

    AlchemyAO.prototype.setNoiseSize = function (size) {
        var texture = this._ssaoPass.getUniform('noiseTex');
        if (!texture) {
            texture = generateNoiseTexture(size);
            this._ssaoPass.setUniform('noiseTex', generateNoiseTexture(size));
        }
        else {
            texture.data = generateNoiseData(size);
            texture.width = texture.height = size;
            texture.dirty();
        }

        this._ssaoPass.setUniform('noiseTexSize', [size, size]);
    };

    AlchemyAO.prototype.getTargetTexture = function () {
        return this._blurPass2.getTargetTexture();
    };

    return AlchemyAO;
});