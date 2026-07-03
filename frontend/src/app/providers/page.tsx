"use client";

import React, { useState } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Typography,
  Popconfirm,
  Tag,
  message,
  Empty,
  Spin,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { providersApi } from "@/lib/api";
import type { ProviderConfig, ProviderFormData } from "@/types";

const { Title, Text } = Typography;

export default function ProvidersPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [form] = Form.useForm();
  // 小眼睛状态：记录哪些行的 api_key 正在显示明文
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // 查询提供商列表
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["providers"],
    queryFn: providersApi.list,
  });

  // 创建提供商
  const createMutation = useMutation({
    mutationFn: (values: ProviderFormData) => providersApi.create(values),
    onSuccess: () => {
      message.success("提供商创建成功");
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      handleCloseModal();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 更新提供商
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProviderFormData> }) =>
      providersApi.update(id, data),
    onSuccess: () => {
      message.success("提供商更新成功");
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      handleCloseModal();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 删除提供商
  const deleteMutation = useMutation({
    mutationFn: (id: string) => providersApi.delete(id),
    onSuccess: () => {
      message.success("提供商已删除");
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const handleOpenCreate = () => {
    setEditingProvider(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleOpenEdit = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    form.setFieldsValue({
      name: provider.name,
      api_base: provider.api_base,
      api_key: "",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingProvider(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingProvider) {
      const data: Partial<ProviderFormData> = { ...values };
      if (!data.api_key) delete data.api_key;
      updateMutation.mutate({ id: editingProvider.id, data });
    } else {
      createMutation.mutate(values);
    }
  };

  // 切换小眼睛
  const toggleKeyVisible = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const columns = [
    {
      title: "提供商名称",
      dataIndex: "name",
      key: "name",
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: "API 地址",
      dataIndex: "api_base",
      key: "api_base",
      ellipsis: true,
    },
    {
      title: "API Key",
      dataIndex: "decrypted_api_key",
      key: "decrypted_api_key",
      width: 280,
      render: (v: string, record: ProviderConfig) => {
        const isVisible = visibleKeys.has(record.id);
        return (
          <Space>
            <code
              style={{
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
            >
              {isVisible ? v : v ? "••••••••" : "-"}
            </code>
            {v && (
              <Button
                type="text"
                size="small"
                icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => toggleKeyVisible(record.id)}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {v}
        </Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      render: (_: any, record: ProviderConfig) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此提供商？"
            description="删除后，使用该提供商的模型可能无法正常工作"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          提供商管理
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            添加提供商
          </Button>
        </Space>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 100 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          dataSource={data?.providers || []}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
          locale={{
            emptyText: <Empty description="暂无提供商，点击上方「添加提供商」开始" />,
          }}
        />
      )}

      {/* 添加/编辑提供商模态框 */}
      <Modal
        title={editingProvider ? "编辑提供商" : "添加提供商"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={handleCloseModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="提供商名称"
            rules={[{ required: true, message: "请输入提供商名称" }]}
          >
            <Input placeholder="如 OpenAI、Qwen、DeepSeek" />
          </Form.Item>

          <Form.Item
            name="api_base"
            label="API 地址"
            rules={[{ required: true, message: "请输入 API 地址" }]}
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item
            name="api_key"
            label={editingProvider ? "API Key（留空不修改）" : "API Key"}
            rules={
              editingProvider
                ? []
                : [{ required: true, message: "请输入 API Key" }]
            }
          >
            <Input.Password
              placeholder={editingProvider ? "留空则保持原 Key 不变" : "sk-xxxx"}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
