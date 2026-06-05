import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { EmbeddingClient } from 'coze-coding-dev-sdk';

const supabase = getSupabaseClient();
const embeddingClient = new EmbeddingClient();

// 创建向量化任务
async function createVectorizeTask(
  taskType: 'port' | 'route' | 'regulation',
  targetId: string,
  action: 'add' | 'update' | 'delete'
) {
  try {
    await supabase
      .from('vectorize_tasks')
      .insert({
        task_type: taskType,
        target_id: targetId,
        action: action,
        status: 'pending'
      });
  } catch (e) {
    console.error('创建向量化任务失败:', e);
  }
}

// GET: 列表、搜索、预览
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  try {
    // 列表查询
    if (action === 'list') {
      const type = searchParams.get('type') || 'port';
      
      if (type === 'port') {
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '500');
        const offset = (page - 1) * pageSize;
        
        const [{ data, error }, { count }] = await Promise.all([
          supabase
            .from('port_data')
            .select('*')
            .order('port_code', { ascending: true })
            .range(offset, offset + pageSize - 1),
          supabase
            .from('port_data')
            .select('*', { count: 'exact', head: true })
        ]);
        
        if (error) throw error;
        return NextResponse.json({ items: data, total: count, page, pageSize });
      } else {
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '500');
        const offset = (page - 1) * pageSize;
        
        const [{ data, error }, { count }] = await Promise.all([
          supabase
            .from('route_data')
            .select('*')
            .order('orig_port', { ascending: true })
            .range(offset, offset + pageSize - 1),
          supabase
            .from('route_data')
            .select('*', { count: 'exact', head: true })
        ]);
        
        if (error) throw error;
        return NextResponse.json({ items: data, total: count, page, pageSize });
      }
    }
    
    // 编码检索
    if (action === 'search') {
      const code = searchParams.get('code') || '';
      
      const { data, error } = await supabase
        .from('port_data')
        .select('*')
        .or(`port_code.ilike.%${code}%,name_cn.ilike.%${code}%`)
        .limit(10);
      
      if (error) throw error;
      return NextResponse.json({ ports: data });
    }
    
    // 预览
    if (action === 'preview') {
      const type = searchParams.get('type');
      const code = searchParams.get('code');
      
      if (type === 'port') {
        const { data, error } = await supabase
          .from('port_data')
          .select('*')
          .eq('port_code', code)
          .single();
        
        if (error) throw error;
        return NextResponse.json({ data });
      } else {
        const [origPort, destPort] = code?.split('-') || [];
        const { data, error } = await supabase
          .from('route_data')
          .select('*')
          .eq('orig_port', origPort)
          .eq('dest_port', destPort)
          .single();
        
        if (error) throw error;
        return NextResponse.json({ data });
      }
    }
    
    // 统计
    if (action === 'stats') {
      const [portsResult, routesResult] = await Promise.all([
        supabase.from('port_data').select('id', { count: 'exact', head: true }),
        supabase.from('route_data').select('id', { count: 'exact', head: true })
      ]);
      
      return NextResponse.json({
        portsCount: portsResult.count || 0,
        routesCount: routesResult.count || 0
      });
    }
    
    // 获取向量化任务列表
    if (action === 'tasks') {
      const status = searchParams.get('status') || 'all';
      let query = supabase
        .from('vectorize_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (status !== 'all') {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ tasks: data });
    }
    
    // 处理向量化任务
    if (action === 'process-task') {
      const taskId = searchParams.get('taskId');
      if (!taskId) {
        return NextResponse.json({ error: '缺少taskId' }, { status: 400 });
      }
      
      // 获取任务
      const { data: task, error: taskError } = await supabase
        .from('vectorize_tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (taskError || !task) {
        return NextResponse.json({ error: '任务不存在' }, { status: 404 });
      }
      
      // 更新任务状态为处理中
      await supabase
        .from('vectorize_tasks')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', taskId);
      
      try {
        if (task.task_type === 'port') {
          // 获取港口数据
          const { data: port, error: portError } = await supabase
            .from('port_data')
            .select('*')
            .eq('port_code', task.target_id)
            .single();
          
          if (portError || !port) {
            throw new Error('港口数据不存在');
          }
          
          // 生成向量化文本
          const text = `港口: ${port.name_cn} (${port.port_code}), 国家: ${port.ctry_name_cn}, 经纬度: (${port.lon}, ${port.lat}), 类型: ${port.port_type}`;
          
          // 调用向量化API
          const embedding = await embeddingClient.embedText(text);
          
          // 更新港口向量
          await supabase
            .from('port_data')
            .update({ 
              vector_status: '已向量化',
              embedding: embedding,
              updated_at: new Date().toISOString()
            })
            .eq('port_code', task.target_id);
          
        } else if (task.task_type === 'route') {
          // 获取航线数据
          const [origPort, destPort] = task.target_id.split('-');
          const { data: route, error: routeError } = await supabase
            .from('route_data')
            .select('*')
            .eq('orig_port', origPort)
            .eq('dest_port', destPort)
            .single();
          
          if (routeError || !route) {
            throw new Error('航线数据不存在');
          }
          
          // 生成向量化文本
          const text = `航线: ${route.orig_port} -> ${route.dest_port}, 轨迹: ${route.geometry_wkt}`;
          
          // 调用向量化API
          const embedding = await embeddingClient.embedText(text);
          
          // 更新航线向量
          await supabase
            .from('route_data')
            .update({ 
              vector_status: '已向量化',
              embedding: embedding,
              updated_at: new Date().toISOString()
            })
            .eq('orig_port', origPort)
            .eq('dest_port', destPort);
        }
        
        // 更新任务状态为完成
        await supabase
          .from('vectorize_tasks')
          .update({ 
            status: 'completed', 
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString()
          })
          .eq('id', taskId);
        
        return NextResponse.json({ success: true, message: '任务处理完成' });
        
      } catch (e) {
        // 更新任务状态为失败
        await supabase
          .from('vectorize_tasks')
          .update({ 
            status: 'failed', 
            error_message: e instanceof Error ? e.message : '处理失败',
            updated_at: new Date().toISOString()
          })
          .eq('id', taskId);
        
        return NextResponse.json({ error: e instanceof Error ? e.message : '处理失败' }, { status: 500 });
      }
    }
    
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('Data maintain error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : '操作失败' 
    }, { status: 500 });
  }
}

// POST: 新增、编辑、删除、向量化
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, type } = body;
    
    // 新增
    if (action === 'add') {
      if (type === 'port') {
        const { data: formData } = body;
        const { data, error } = await supabase
          .from('port_data')
          .insert({
            port_code: formData.portCode,
            name_cn: formData.nameCn,
            ctry_code: formData.ctryCode,
            ctry_name_cn: formData.ctryNameCn,
            ctry_name_en: formData.ctryNameEn,
            name_pinyin: formData.namePinyin,
            name_py: formData.namePy,
            tz_offset: parseFloat(formData.tzOffset) || 0,
            port_type: formData.portType,
            lon: parseFloat(formData.lon) || 0,
            lat: parseFloat(formData.lat) || 0,
            continent_code: formData.continentCode,
            continent_name_cn: formData.continentNameCn,
            continent_name_en: formData.continentNameEn,
            vector_status: '未向量化'
          })
          .select()
          .single();
        
        if (error) throw error;
        // 创建向量化任务
        await createVectorizeTask('port', formData.portCode, 'add');
        return NextResponse.json({ success: true, data, message: '港口数据新增成功' });
      } else {
        const { data: formData } = body;
        const { data, error } = await supabase
          .from('route_data')
          .insert({
            orig_port: formData.OrigPort,
            dest_port: formData.DestPort,
            geometry_wkt: formData.geometry_wkt,
            vector_status: '未向量化'
          })
          .select()
          .single();
        
        if (error) throw error;
        // 创建向量化任务
        await createVectorizeTask('route', `${formData.OrigPort}-${formData.DestPort}`, 'add');
        return NextResponse.json({ success: true, data, message: '航线数据新增成功' });
      }
    }
    
    // 编辑
    if (action === 'edit') {
      if (type === 'port') {
        const { portCode, data: formData } = body;
        const { data, error } = await supabase
          .from('port_data')
          .update({
            name_cn: formData.nameCn,
            ctry_code: formData.ctryCode,
            ctry_name_cn: formData.ctryNameCn,
            ctry_name_en: formData.ctryNameEn,
            name_pinyin: formData.namePinyin,
            name_py: formData.namePy,
            tz_offset: parseFloat(formData.tzOffset) || 0,
            port_type: formData.portType,
            lon: parseFloat(formData.lon) || 0,
            lat: parseFloat(formData.lat) || 0,
            continent_code: formData.continentCode,
            continent_name_cn: formData.continentNameCn,
            continent_name_en: formData.continentNameEn,
            updated_at: new Date().toISOString()
          })
          .eq('port_code', portCode)
          .select()
          .single();
        
        if (error) throw error;
        // 创建向量化任务
        await createVectorizeTask('port', portCode, 'update');
        return NextResponse.json({ success: true, data, message: '港口数据更新成功' });
      } else {
        const { OrigPort, DestPort, data: formData } = body;
        const { data, error } = await supabase
          .from('route_data')
          .update({
            geometry_wkt: formData.geometry_wkt,
            updated_at: new Date().toISOString()
          })
          .eq('orig_port', OrigPort)
          .eq('dest_port', DestPort)
          .select()
          .single();
        
        if (error) throw error;
        // 创建向量化任务
        await createVectorizeTask('route', `${OrigPort}-${DestPort}`, 'update');
        return NextResponse.json({ success: true, data, message: '航线数据更新成功' });
      }
    }
    
    // 删除
    if (action === 'delete') {
      if (type === 'port') {
        const { portCode } = body;
        const { error } = await supabase
          .from('port_data')
          .delete()
          .eq('port_code', portCode);
        
        if (error) throw error;
        // 创建向量化任务（删除向量）
        await createVectorizeTask('port', portCode, 'delete');
        return NextResponse.json({ success: true, message: '港口数据删除成功' });
      } else {
        const { OrigPort, DestPort } = body;
        const { error } = await supabase
          .from('route_data')
          .delete()
          .eq('orig_port', OrigPort)
          .eq('dest_port', DestPort);
        
        if (error) throw error;
        // 创建向量化任务（删除向量）
        await createVectorizeTask('route', `${OrigPort}-${DestPort}`, 'delete');
        return NextResponse.json({ success: true, message: '航线数据删除成功' });
      }
    }
    
    // 单个向量化
    if (action === 'vectorize') {
      if (type === 'port') {
        const { portCode } = body;
        
        // 获取港口数据
        const { data: port, error: queryError } = await supabase
          .from('port_data')
          .select('*')
          .eq('port_code', portCode)
          .single();
        
        if (queryError) throw queryError;
        if (!port) return NextResponse.json({ error: '港口数据不存在' }, { status: 404 });
        
        // 构建向量化文本
        const vectorText = `港口代码:${port.port_code} 名称:${port.name_cn} 国家:${port.ctry_name_cn} 类型:${port.port_type} 经度:${port.lon} 纬度:${port.lat} 大洲:${port.continent_name_cn}`;
        
        try {
          // 更新状态为处理中
          await supabase
            .from('port_data')
            .update({ vector_status: '向量化中', updated_at: new Date().toISOString() })
            .eq('port_code', portCode);
          
          // 调用embedding API
          const embedding = await embeddingClient.embedText(vectorText);
          
          // 更新向量和状态
          const { error: updateError } = await supabase
            .from('port_data')
            .update({ 
              embedding: embedding,
              vector_status: '向量化成功', 
              updated_at: new Date().toISOString() 
            })
            .eq('port_code', portCode);
          
          if (updateError) throw updateError;
          return NextResponse.json({ success: true, message: '港口数据向量化成功' });
        } catch (embedError) {
          await supabase
            .from('port_data')
            .update({ vector_status: '向量化失败', updated_at: new Date().toISOString() })
            .eq('port_code', portCode);
          return NextResponse.json({ error: `向量化失败: ${embedError instanceof Error ? embedError.message : String(embedError)}` }, { status: 500 });
        }
      } else {
        const { OrigPort, DestPort } = body;
        
        // 获取航线数据
        const { data: route, error: queryError } = await supabase
          .from('route_data')
          .select('*')
          .eq('orig_port', OrigPort)
          .eq('dest_port', DestPort)
          .single();
        
        if (queryError) throw queryError;
        if (!route) return NextResponse.json({ error: '航线数据不存在' }, { status: 404 });
        
        // 构建向量化文本
        const vectorText = `航线 起始港:${route.orig_port} 目的港:${route.dest_port} 航线:${route.geometry_wkt}`;
        
        try {
          // 更新状态为处理中
          await supabase
            .from('route_data')
            .update({ vector_status: '向量化中', updated_at: new Date().toISOString() })
            .eq('orig_port', OrigPort)
            .eq('dest_port', DestPort);
          
          // 调用embedding API
          const embedding = await embeddingClient.embedText(vectorText);
          
          // 更新向量和状态
          const { error: updateError } = await supabase
            .from('route_data')
            .update({ 
              embedding: embedding,
              vector_status: '向量化成功', 
              updated_at: new Date().toISOString() 
            })
            .eq('orig_port', OrigPort)
            .eq('dest_port', DestPort);
          
          if (updateError) throw updateError;
          return NextResponse.json({ success: true, message: '航线数据向量化成功' });
        } catch (embedError) {
          await supabase
            .from('route_data')
            .update({ vector_status: '向量化失败', updated_at: new Date().toISOString() })
            .eq('orig_port', OrigPort)
            .eq('dest_port', DestPort);
          return NextResponse.json({ error: `向量化失败: ${embedError instanceof Error ? embedError.message : String(embedError)}` }, { status: 500 });
        }
      }
    }
    
    // 批量向量化（选中的或全部）
    if (action === 'batch-vectorize') {
      const { portCodes, OrigPorts, DestPorts, vectorizeAll } = body;
      
      if (type === 'port') {
        // 获取需要向量化的港口列表
        let query = supabase.from('port_data').select('*');
        
        if (!vectorizeAll && portCodes) {
          query = query.in('port_code', portCodes);
        } else if (vectorizeAll) {
          query = query.or('vector_status.is.null,vector_status.eq.未向量化,vector_status.eq.向量化失败');
        }
        
        const { data: ports, error: queryError } = await query.limit(100);
        
        if (queryError) throw queryError;
        if (!ports || ports.length === 0) {
          return NextResponse.json({ success: true, message: '没有需要向量化的数据', processed: 0 });
        }
        
        let processed = 0;
        let failed = 0;
        const errors: string[] = [];
        
        for (const port of ports) {
          const vectorText = `港口代码:${port.port_code} 名称:${port.name_cn} 国家:${port.ctry_name_cn} 类型:${port.port_type} 经度:${port.lon} 纬度:${port.lat} 大洲:${port.continent_name_cn}`;
          
          try {
            const embedding = await embeddingClient.embedText(vectorText);
            
            const { error: updateError } = await supabase
              .from('port_data')
              .update({ 
                embedding: embedding,
                vector_status: '向量化成功', 
                updated_at: new Date().toISOString() 
              })
              .eq('port_code', port.port_code);
            
            if (updateError) {
              failed++;
              errors.push(`${port.port_code}: ${updateError.message}`);
            } else {
              processed++;
            }
          } catch (embedError) {
            failed++;
            errors.push(`${port.port_code}: ${embedError instanceof Error ? embedError.message : String(embedError)}`);
            await supabase
              .from('port_data')
              .update({ vector_status: '向量化失败', updated_at: new Date().toISOString() })
              .eq('port_code', port.port_code);
          }
        }
        
        return NextResponse.json({ 
          success: true, 
          message: `批量向量化完成，成功${processed}条，失败${failed}条`,
          processed,
          failed,
          errors: errors.slice(0, 10)
        });
      } else {
        // 航线向量化
        let query = supabase.from('route_data').select('*');
        
        if (!vectorizeAll && OrigPorts && DestPorts) {
          // 批量查询多个航线
          const { data: routes, error: queryError } = await query.limit(100);
          const filteredRoutes = routes?.filter((r, i) => 
            OrigPorts[i] && DestPorts[i] && r.orig_port === OrigPorts[i] && r.dest_port === DestPorts[i]
          );
        } else if (vectorizeAll) {
          query = query.or('vector_status.is.null,vector_status.eq.未向量化,vector_status.eq.向量化失败');
        }
        
        const { data: routes, error: queryError } = await query.limit(100);
        
        if (queryError) throw queryError;
        if (!routes || routes.length === 0) {
          return NextResponse.json({ success: true, message: '没有需要向量化的数据', processed: 0 });
        }
        
        let processed = 0;
        let failed = 0;
        const errors: string[] = [];
        
        for (const route of routes) {
          const vectorText = `航线 起始港:${route.orig_port} 目的港:${route.dest_port} 航线:${route.geometry_wkt}`;
          
          try {
            const embedding = await embeddingClient.embedText(vectorText);
            
            const { error: updateError } = await supabase
              .from('route_data')
              .update({ 
                embedding: embedding,
                vector_status: '向量化成功', 
                updated_at: new Date().toISOString() 
              })
              .eq('orig_port', route.orig_port)
              .eq('dest_port', route.dest_port);
            
            if (updateError) {
              failed++;
              errors.push(`${route.orig_port}-${route.dest_port}: ${updateError.message}`);
            } else {
              processed++;
            }
          } catch (embedError) {
            failed++;
            errors.push(`${route.orig_port}-${route.dest_port}: ${embedError instanceof Error ? embedError.message : String(embedError)}`);
            await supabase
              .from('route_data')
              .update({ vector_status: '向量化失败', updated_at: new Date().toISOString() })
              .eq('orig_port', route.orig_port)
              .eq('dest_port', route.dest_port);
          }
        }
        
        return NextResponse.json({ 
          success: true, 
          message: `批量向量化完成，成功${processed}条，失败${failed}条`,
          processed,
          failed,
          errors: errors.slice(0, 10)
        });
      }
    }
    
    // 取消向量化
    if (action === 'cancel-vectorize') {
      const { portCodes, OrigPorts, DestPorts } = body;
      
      if (type === 'port') {
        // 将指定港口的向量化状态重置为"未向量化"
        let query = supabase.from('port_data').update({ 
          vector_status: '未向量化',
          updated_at: new Date().toISOString() 
        });
        
        if (portCodes && portCodes.length > 0) {
          query = query.in('port_code', portCodes);
        } else {
          // 取消所有正在向量化的（状态为空或待处理的）
          query = query.or('vector_status.is.null,vector_status.eq.向量化中');
        }
        
        const { error: updateError } = await query;
        
        if (updateError) throw updateError;
        return NextResponse.json({ 
          success: true, 
          message: '已取消向量化任务' 
        });
      } else {
        // 航线取消向量化
        const { error: updateError } = await supabase
          .from('route_data')
          .update({ 
            vector_status: '未向量化',
            updated_at: new Date().toISOString() 
          })
          .or('vector_status.is.null,vector_status.eq.向量化中');
        
        if (updateError) throw updateError;
        return NextResponse.json({ 
          success: true, 
          message: '已取消向量化任务' 
        });
      }
    }
    
    // 批量导入
    if (action === 'batch-import') {
      const { items } = body;
      
      if (type === 'port') {
        const portItems = items.map((item: Record<string, string>) => ({
          port_code: item.port_code || item.portCode,
          name_cn: item.name_cn || item.nameCn,
          ctry_code: item.ctry_code || item.ctryCode || '',
          ctry_name_cn: item.ctry_name_cn || item.ctryNameCn || '',
          ctry_name_en: item.ctry_name_en || item.ctryNameEn || '',
          name_pinyin: item.name_pinyin || item.namePinyin || '',
          name_py: item.name_py || item.namePy || '',
          tz_offset: parseFloat(item.tz_offset || item.tzOffset) || 0,
          port_type: item.port_type || item.portType || '',
          lon: parseFloat(item.lon) || 0,
          lat: parseFloat(item.lat) || 0,
          continent_code: item.continent_code || item.continentCode || '',
          continent_name_cn: item.continent_name_cn || item.continentNameCn || '',
          continent_name_en: item.continent_name_en || item.continentNameEn || '',
          vector_status: '未向量化'
        }));
        
        const { data, error } = await supabase
          .from('port_data')
          .insert(portItems)
          .select();
        
        if (error) throw error;
        return NextResponse.json({ 
          success: true, 
          count: data?.length || 0, 
          message: `成功导入 ${data?.length || 0} 条港口数据` 
        });
      } else {
        const routeItems = items.map((item: Record<string, string>) => ({
          orig_port: item.orig_port || item.OrigPort,
          dest_port: item.dest_port || item.DestPort,
          geometry_wkt: item.geometry_wkt || '',
          vector_status: '未向量化'
        }));
        
        const { data, error } = await supabase
          .from('route_data')
          .insert(routeItems)
          .select();
        
        if (error) throw error;
        return NextResponse.json({ 
          success: true, 
          count: data?.length || 0, 
          message: `成功导入 ${data?.length || 0} 条航线数据` 
        });
      }
    }
    
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('Data maintain error:', error);
    return NextResponse.json({ 
      success: false,
      message: error instanceof Error ? error.message : '操作失败' 
    }, { status: 500 });
  }
}
