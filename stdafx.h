// stdafx.h : include file for standard system include files,
// or project specific include files that are used frequently, but
// are changed infrequently
//

#pragma once
#pragma once
#ifdef WIN32
#include "targetver.h"
#define _CRT_SECURE_NO_WARNINGS
#endif

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#ifdef WIN32
#include <assert.h>
#include <io.h>
#include <tchar.h>
#include <windows.h>
#else
#include <string.h>
#ifndef EMSCRIPTEN
#include <sys/io.h>
#endif
#endif
