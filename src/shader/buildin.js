define(function (require) {

    var library = require('./library');
    var Shader = require('../Shader');


    Shader['import'](require('./source/util.essl'));

    // Some build in shaders
    Shader['import'](require('./source/basic.essl'));
    Shader['import'](require('./source/lambert.essl'));
    Shader['import'](require('./source/phong.essl'));
    Shader['import'](require('./source/standard.essl'));
    Shader['import'](require('./source/wireframe.essl'));
    Shader['import'](require('./source/skybox.essl'));
    Shader['import'](require('./source/prez.essl'));

    Shader['import'](require('./source/shadowmap.essl'));

    library.template('qtek.basic', Shader.source('qtek.basic.vertex'), Shader.source('qtek.basic.fragment'));
    library.template('qtek.lambert', Shader.source('qtek.lambert.vertex'), Shader.source('qtek.lambert.fragment'));
    library.template('qtek.phong', Shader.source('qtek.phong.vertex'), Shader.source('qtek.phong.fragment'));
    library.template('qtek.wireframe', Shader.source('qtek.wireframe.vertex'), Shader.source('qtek.wireframe.fragment'));
    library.template('qtek.skybox', Shader.source('qtek.skybox.vertex'), Shader.source('qtek.skybox.fragment'));
    library.template('qtek.prez', Shader.source('qtek.prez.vertex'), Shader.source('qtek.prez.fragment'));
    library.template('qtek.standard', Shader.source('qtek.standard.vertex'), Shader.source('qtek.standard.fragment'));
    // Compatible with previous
    library.template('qtek.physical', Shader.source('qtek.physical.vertex'), Shader.source('qtek.physical.fragment'));

    // Some build in shaders
    Shader['import'](require('./source/compositor/coloradjust.essl'));
    Shader['import'](require('./source/compositor/blur.essl'));
    Shader['import'](require('./source/compositor/lum.essl'));
    Shader['import'](require('./source/compositor/lut.essl'));
    Shader['import'](require('./source/compositor/output.essl'));
    Shader['import'](require('./source/compositor/downsample.essl'));
    Shader['import'](require('./source/compositor/upsample.essl'));
    Shader['import'](require('./source/compositor/hdr.essl'));
    Shader['import'](require('./source/compositor/lensflare.essl'));
    Shader['import'](require('./source/compositor/blend.essl'));
    Shader['import'](require('./source/compositor/fxaa.essl'));

});