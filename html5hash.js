$().ready(function () {

    /*
     * Helpers
     */

    var getUnique = function () {
        var uniquecnt = 0;

        function getUnique() {
            return (uniquecnt++);
        }

        return getUnique;
    }();

    function decimalToHexString(number) {
        if (number < 0) {
            number = 0xFFFFFFFF + number + 1;
        }

        return number.toString(16).padStart(8, '0');
    }

    function digits(number, dig) {
        var shift = Math.pow(10, dig);
        return Math.floor(number * shift) / shift;
    }

    function escapeHtml(text) {
        return $('<div/>').text(text).html();
    }

    function swapendian32(val) {
        return (((val & 0xFF) << 24)
           | ((val & 0xFF00) << 8)
           | ((val >> 8) & 0xFF00)
           | ((val >> 24) & 0xFF)) >>> 0;
    }

    /*
     * CryptoJS ArrayBuffer helper
     */
    function arrayBufferToWordArray(arrayBuffer) {
        var fullWords = Math.floor(arrayBuffer.byteLength / 4);
        var bytesLeft = arrayBuffer.byteLength % 4;

        var u32 = new Uint32Array(arrayBuffer, 0, fullWords);
        var u8 = new Uint8Array(arrayBuffer);

        var cp = [];
        for (var i = 0; i < fullWords; ++i) {
            cp.push(swapendian32(u32[i]));
        }

        if (bytesLeft) {
            var pad = 0;
            for (var i = bytesLeft; i > 0; --i) {
                pad = pad << 8;
                pad += u8[u8.byteLength - i];
            }

            for (var i = 0; i < 4 - bytesLeft; ++i) {
                pad = pad << 8;
            }

            cp.push(pad);
        }

        return CryptoJS.lib.WordArray.create(cp, arrayBuffer.byteLength);
    }

    function bytes2si(bytes, outputdigits) {
        if (bytes < 1024) { // Bytes
            return digits(bytes, outputdigits) + " b";
        }
        else if (bytes < 1048576) { // KiB
            return digits(bytes / 1024, outputdigits) + " KiB";
        }
        else if (bytes < 1073741824) { // MiB
            return digits(bytes / 1048576, outputdigits) + " MiB";
        }
        
        return digits(bytes / 1073741824, outputdigits) + " GiB";
    }

    function bytes2si2(bytes1, bytes2, outputdigits) {
        var big = Math.max(bytes1, bytes2);

        if (big < 1024) { // Bytes
            return bytes1 + "/" + bytes2 + " b";
        }
        else if (big < 1048576) { // KiB
            return digits(bytes1 / 1024, outputdigits) + "/" +
                digits(bytes2 / 1024, outputdigits) + " KiB";
        }
        else if (big < 1073741824) { // MiB
            return digits(bytes1 / 1048576, outputdigits) + "/" +
                digits(bytes2 / 1048576, outputdigits) + " MiB";
        }

        return digits(bytes1 / 1073741824, outputdigits) + "/" +
            digits(bytes2 / 1073741824, outputdigits) + " GiB";
    }

    function progressiveRead(file, work, done) {
        var chunkSize = 2097152; // Optimized chunk size: 2 MiB
        var pos = 0;
        var reader = new FileReader();

        function progressiveReadNext() {
            var end = Math.min(pos + chunkSize, file.size);

            reader.onload = function (e) {
                pos = end;
                work(e.target.result, pos, file);
                if (pos < file.size) {
                    setTimeout(progressiveReadNext, 0);
                }
                else {
                    done(file);
                }
            };

            var blob;
            if (file.slice) {
                blob = file.slice(pos, end);
            }
            else if (file.webkitSlice) {
                blob = file.webkitSlice(pos, end);
            }
            
            if (blob) {
                reader.readAsArrayBuffer(blob);
            } else {
                done(file); // Safety fallback
            }
        }

        setTimeout(progressiveReadNext, 0);
    }

    // List all CryptoJS-based supported algorithms
    var cryptoJSAlgorithms = [
        { name: "MD5", type: CryptoJS.algo.MD5 },
        { name: "SHA1", type: CryptoJS.algo.SHA1 },
        { name: "SHA256",  type: CryptoJS.algo.SHA256 },
        { name: "SHA512",  type: CryptoJS.algo.SHA512 },
        { name: "SHA3-224",  type: CryptoJS.algo.SHA3, param: { outputLength: 224 } },
        { name: "SHA3-256",  type: CryptoJS.algo.SHA3, param: { outputLength: 256 } },
        { name: "SHA3-384",  type: CryptoJS.algo.SHA3, param: { outputLength: 384 } },
        { name: "SHA3-512",  type: CryptoJS.algo.SHA3, param: { outputLength: 512 } },
        { name: "RIPEMD-160", type: CryptoJS.algo.RIPEMD160 }
    ];

    // Stats variables
    var statsTotalFiles = 0;
    var statsTotalSize = 0;

    function updateStatsBar() {
        if (statsTotalFiles > 0) {
            $("#statsBar").show();
            $("#stats-count").text(statsTotalFiles);
            $("#stats-size").text(bytes2si(statsTotalSize, 2));
        } else {
            $("#statsBar").hide();
        }
    }

    // Setup Copy helper
    window.copyToClipboard = function(btn) {
        var $btn = $(btn);
        var $hashSpan = $btn.siblings('.algoresult');
        var hashText = $hashSpan.text();
        
        navigator.clipboard.writeText(hashText).then(function() {
            var originalText = $btn.text();
            $btn.text('Copied!').addClass('copied');
            setTimeout(function() {
                $btn.text(originalText).removeClass('copied');
            }, 1500);
        }).catch(function(err) {
            console.error('Failed to copy: ', err);
            // Fallback for older browsers / non-secure contexts
            var $temp = $("<input>");
            $("body").append($temp);
            $temp.val(hashText).select();
            document.execCommand("copy");
            $temp.remove();
            
            var originalText = $btn.text();
            $btn.text('Copied!').addClass('copied');
            setTimeout(function() {
                $btn.text(originalText).removeClass('copied');
            }, 1500);
        });
    };

    function renderResultRow(algoName, hashValue) {
        return '<tr>' +
            '<td class="algoname">' + escapeHtml(algoName) + ':</td>' +
            '<td class="algoresult-container">' +
                '<span class="algoresult">' + escapeHtml(hashValue) + '</span>' +
                '<button type="button" class="copy-btn" onclick="copyToClipboard(this)">Copy</button>' +
            '</td>' +
            '</tr>';
    }

    function handleFileSelect(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        
        var files;
        if (evt.target.files) {
            files = evt.target.files;
        }
        else if (evt.dataTransfer && evt.dataTransfer.files) {
            files = evt.dataTransfer.files;
        }
        
        if (!files || files.length === 0) return;

        for (var i = 0, f; f = files[i]; i++) {
            (function (file) {
                var start = (new Date).getTime();
                var lastprogress = 0;

                // 1. Identify enabled CryptoJS algorithms
                var enabledCryptoJS = [];
                for (var j = 0; j < cryptoJSAlgorithms.length; j++) {
                    var current = cryptoJSAlgorithms[j];
                    if ($('[name="' + current.name + '-switch"]').prop("checked")) {
                        var algoInst = { name: current.name, instance: current.type.create(current.param) };
                        enabledCryptoJS.push(algoInst);
                    }
                }

                // 2. Identify enabled CRC-32 (legacy JS implementation)
                var doCRC32 = $('[name="crc32switch"]').prop("checked");
                var crc32intermediate = 0;

                // 3. Identify enabled WebAssembly algorithms
                var wasmAlgosToInit = [];
                if ($('[name="XXH3-64-switch"]').prop("checked")) {
                    wasmAlgosToInit.push({ name: "XXH3-64", creator: hashwasm.createXXHash3 });
                }
                if ($('[name="XXH3-128-switch"]').prop("checked")) {
                    wasmAlgosToInit.push({ name: "XXH3-128", creator: hashwasm.createXXHash128 });
                }
                if ($('[name="BLAKE3-switch"]').prop("checked")) {
                    wasmAlgosToInit.push({ name: "BLAKE3", creator: hashwasm.createBLAKE3 });
                }
                if ($('[name="CRC64-switch"]').prop("checked")) {
                    wasmAlgosToInit.push({ name: "CRC64", creator: hashwasm.createCRC64 });
                }

                // Generate UI list card
                var uid = "filehash" + getUnique();
                $("#list").append('<li id="' + uid + '" class="entrystyle">'
                    + '<b>' + escapeHtml(file.name) + ' <span class="progresstext"></span></b>'
                    + '<div class="progress"><div class="progress-bar-value" style="width: 0%"></div></div>'
                    + '</li>');

                // Update stats
                statsTotalFiles++;
                statsTotalSize += file.size;
                updateStatsBar();

                // Initialize WebAssembly instances asynchronously before reading file
                Promise.all(wasmAlgosToInit.map(function(item) {
                    return item.creator().then(function(hasher) {
                        hasher.init();
                        return { name: item.name, instance: hasher };
                    });
                })).then(function(enabledWasmAlgos) {
                    
                    // Start reading
                    progressiveRead(file,
                    function (data, pos, fileObj) {
                        // Work chunk
                        var wordArray;
                        if (enabledCryptoJS.length > 0) {
                            wordArray = arrayBufferToWordArray(data);
                        }

                        for (var j = 0; j < enabledCryptoJS.length ; j++) {
                            enabledCryptoJS[j].instance.update(wordArray);
                        }

                        var uint8Chunk = new Uint8Array(data);
                        for (var k = 0; k < enabledWasmAlgos.length; k++) {
                            enabledWasmAlgos[k].instance.update(uint8Chunk);
                        }

                        if (doCRC32) {
                            crc32intermediate = crc32(uint8Chunk, crc32intermediate);
                        }

                        // Update progress bar
                        var progress = Math.floor((pos / fileObj.size) * 100);
                        if (progress > lastprogress) {
                            var took = ((new Date).getTime() - start) / 1000;

                            if (took > 0.1) {
                                $("#" + uid + " .progress-bar-value").css('width', progress + '%');
                            }

                            $("#" + uid + " .progresstext").html('('
                                + bytes2si2(pos, fileObj.size, 2) + ' @ ' + bytes2si(pos / took, 2) + '/s )');
                            
                            lastprogress = progress;
                        }
                    },
                    function (fileObj) {
                        // Hashing done
                        var took = ((new Date).getTime() - start) / 1000;
                        if (took <= 0) took = 0.001; // Safety divide-by-zero

                        var results = '<div class="resultdiv"><table>';

                        if (doCRC32) {
                            var crc32Val = decimalToHexString(crc32intermediate);
                            results += renderResultRow("CRC-32", crc32Val);
                        }

                        for (var k = 0; k < enabledWasmAlgos.length; k++) {
                            var hashVal = enabledWasmAlgos[k].instance.digest();
                            results += renderResultRow(enabledWasmAlgos[k].name, hashVal);
                        }

                        for (var j = 0; j < enabledCryptoJS.length ; j++) {
                            var hashVal = enabledCryptoJS[j].instance.finalize().toString();
                            results += renderResultRow(enabledCryptoJS[j].name, hashVal);
                        }

                        results += '</table></div>';
                        results += '<span class="resulttaken">Time taken: ' + digits(took, 2) + 's @ ' + bytes2si(fileObj.size / took, 2) + '/s</span>';
                        
                        $("#" + uid).append(results);
                        $("#" + uid).addClass('completed');

                        $("#" + uid + " .progress")
                            .hide('slow');
                    });
                }).catch(function(err) {
                    console.error("WASM Hasher Initialization failed: ", err);
                    $("#" + uid + " .progresstext").html('<span style="color: var(--accent-danger);">Initialization failed</span>');
                });

            })(f);
        }
    }

    function handleDragOver(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        if (evt.dataTransfer) {
            evt.dataTransfer.dropEffect = 'copy';
        }
    }

    function triggerFileSelection() {
        $("#hiddenFilesSelector").click();
    }

    function compatible() {
        try {
            if (typeof FileReader === "undefined") return false;
            if (typeof Blob === "undefined") return false;
            
            var blob = new Blob();
            if (!blob.slice && !blob.webkitSlice) return false;

            if (!('draggable' in document.createElement('span'))) return false;
        } catch (e) {
            return false;
        }
        return true;
    }

    // Interactive custom checkbox labels
    $('input[type="checkbox"]').on('change', function() {
        $(this).closest('.algo-card').toggleClass('checked-state', this.checked);
    });
    
    // Initial checkbox visual states
    $('input[type="checkbox"]').each(function() {
        $(this).closest('.algo-card').toggleClass('checked-state', this.checked);
    });

    // Check browser compatibility and toggle warnings
    if (compatible()) {
        $("#overlay").hide();
        $("#overlaytextbox").hide();
    } else {
        $("#overlay").show();
        $("#overlaytextbox").show();
    }

    // Hide the additional algorithms initial layout
    $(".additionalalgos").hide();

    // Setup the drag and drop listeners
    var dropZone = document.getElementById('drop_zone');
    if (dropZone) {
        dropZone.addEventListener('dragover', handleDragOver, false);
        dropZone.addEventListener('drop', handleFileSelect, false);
    }

    // Setup browse listener
    var fileSelector = document.getElementById('hiddenFilesSelector');
    if (fileSelector) {
        fileSelector.addEventListener('change', handleFileSelect, false);
    }

    $("#placeholder").click(triggerFileSelection);

    // Setup more/less buttons
    $("#algosshow").click(function (e) {
        e.preventDefault();
        $(".additionalalgos").show();
        $("#algosshow").hide();
    });

    $("#algoshide").click(function (e) {
        e.preventDefault();
        $(".additionalalgos").hide();
        $("#algosshow").show();
    });

    // Clear stats and lists
    $("#clear-list-btn").click(function() {
        $("#list").empty();
        statsTotalFiles = 0;
        statsTotalSize = 0;
        updateStatsBar();
    });

});